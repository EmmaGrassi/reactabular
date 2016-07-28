import ReactDOM from 'react-dom';
import React from 'react';
import {
  Table, Sticky, sort, resizableColumn, resolve, highlight, search
} from 'reactabular';
import { mergeClassNames } from 'reactabular-utils';
import { DragSource, DropTarget } from 'react-dnd';
import { compose } from 'redux';
import uuid from 'uuid';
import * as stylesheet from 'stylesheet-helpers';
import findIndex from 'lodash/findIndex';
import orderBy from 'lodash/orderBy';

export default class EasyTable extends React.Component {
  constructor(props) {
    super(props);

    // Generate a unique id for the instance so we
    // don't get clashing class names for resizing.
    this.id = uuid.v4();

    this.state = {
      sortingColumns: null,
      originalColumns: props.columns,
      columns: this.bindColumns(props.columns),
      rows: props.rows
    };

    this.bindColumns = this.bindColumns.bind(this);
    this.onMove = this.onMove.bind(this);

    // References to header/body elements so they can be
    // kept in sync while scrolling.
    this.tableHeader = null;
    this.tableBody = null;

    // Custom stylesheet maintained for performance purposes.
    //
    // This can fail on old IE due to low maximum stylesheet limit.
    this.styleSheetElement = null;
    this.styleSheet = null;
  }
  componentDidMount() {
    const { styleSheetElement, styleSheet } = stylesheet.create();

    this.styleSheetElement = styleSheetElement;
    this.styleSheet = styleSheet;

    this.initializeStyles(this.state.columns);
  }
  componentWillUnmount() {
    this.styleSheetElement.remove();
  }
  componentWillReceiveProps(nextProps) {
    if (this.state.originalColumns !== nextProps.columns) {
      this.setState({
        originalColumns: nextProps.columns,
        columns: this.bindColumns(nextProps.columns)
      });
    }

    if (this.state.rows !== nextProps.rows) {
      this.setState({
        rows: nextProps.rows
      });
    }
  }
  render() {
    const components = {
      header: {
        cell: DndHeader
      }
    };
    const {
      rowKey, query, tableWidth, tableHeight, classNames, onRow
    } = this.props;
    const { columns, sortingColumns } = this.state;
    const rows = compose(
      sort.sorter(
        { columns, sortingColumns, sort: orderBy }
      ),
      highlight.highlighter({ columns, matches: search.matches, query }),
      search.multipleColumns({ columns, query }),
      resolve.resolve({
        columns,
        method: (row, column) => resolve.byFunction('cell.resolve')(
          resolve.nested(row, column),
          column
        )
      })
    )(this.state.rows);
    const tableHeaderWidth = this.tableHeader && this.tableHeader.scrollWidth;
    const tableBodyWidth = this.tableBody && this.tableBody.scrollWidth;
    const scrollOffset = tableHeaderWidth - tableBodyWidth;

    return (
      <Table.Provider
        className={classNames.table && classNames.table.wrapper}
        components={components}
        columns={columns}
        style={{ width: tableWidth }}
      >
        <Sticky.Header
          className={classNames.header && classNames.header.wrapper}
          style={{
            maxWidth: tableWidth
          }}
          ref={tableHeader => {
            if (tableHeader) {
              this.tableHeader = ReactDOM.findDOMNode(tableHeader);
            }
          }}
          tableBody={this.tableBody}
        />

        <Sticky.Body
          className={classNames.body && classNames.body.wrapper}
          rows={rows}
          rowKey={rowKey}
          onRow={onRow}
          style={{
            paddingRight: scrollOffset,
            maxWidth: tableWidth,
            maxHeight: tableHeight
          }}
          ref={tableBody => {
            if (tableBody) {
              this.tableBody = ReactDOM.findDOMNode(tableBody);
            }
          }}
          tableHeader={this.tableHeader}
        />
      </Table.Provider>
    );
  }
  initializeStyles(columns) {
    columns.forEach((column, i) => (
      stylesheet.updateProperties(
        this.styleSheet,
        getColumnClassName(this.id, i),
        {
          width: `${column.width}px`,
          minWidth: `${column.width}px`
        }
      )
    ));
  }
  bindColumns(columns) {
    const resizable = resizableColumn({
      getWidth: column => column.props.style.width,
      onDrag: (width, { columnIndex }) => {
        // Update the width of the changed column class
        stylesheet.updateProperties(
          this.styleSheet,
          getColumnClassName(this.id, columnIndex),
          {
            width: `${width}px`,
            minWidth: `${width}px`
          }
        );
      }
    });

    const sortable = sort.sort({
      // Point the transform to your rows. React state can work for this purpose
      // but you can use a state manager as well.
      getSortingColumns: () => this.state.sortingColumns || {},

      // The user requested sorting, adjust the sorting state accordingly.
      // This is a good chance to pass the request through a sorter.
      onSort: selectedColumn => {
        this.setState({
          sortingColumns: sort.byColumns({ // sort.byColumn would work too
            sortingColumns: this.state.sortingColumns,
            selectedColumn
          })
        });
      }
    });

    return columns.map((column, i) => {
      if (column.header && column.cell) {
        const existingHeaderProps = column.header.props;
        const existingHeaderFormat = column.header.format || (v => v);
        const existingHeaderTransforms = column.header.transforms || [];
        const existingCellFormat = column.cell.format || (v => v);
        let newHeaderProps = existingHeaderProps;
        let newHeaderFormat = existingHeaderFormat;
        let newHeaderTransforms = existingHeaderTransforms;
        let newCellFormat = existingCellFormat;

        if (column.header.sortable && column.header.resizable) {
          newHeaderFormat = (v, extra) => resizable(
            <div>
              <span>{existingHeaderFormat(v, extra)}</span>
              {React.createElement(
                'span',
                sortable(null, extra)
              )}
            </div>,
            extra
          );
        } else if (column.header.sortable) {
          newHeaderTransforms = existingHeaderTransforms.concat([sortable]);
        } else if (column.header.resizable) {
          newHeaderFormat = (v, extra) => resizable(
            existingHeaderFormat(v, extra),
            extra
          );
        }

        if (column.header.draggable) {
          newHeaderProps = {
            // DnD needs this to tell header cells apart
            label: column.header.label,
            onMove: o => this.onMove(o)
          };
        }

        if (column.cell.highlight) {
          newCellFormat = (v, extra) => highlight.cell(
            existingCellFormat(v, extra),
            extra
          );
        }

        return {
          ...column,
          props: {
            ...column.props,
            className: mergeClassNames(
              getColumnClassName(this.id, i),
              column.props && column.props.className
            )
          },
          header: {
            ...column.header,
            props: newHeaderProps,
            transforms: newHeaderTransforms,
            format: newHeaderFormat
          },
          cell: {
            ...column.cell,
            format: newCellFormat
          }
        };
      }

      return column;
    });
  }
  onMove(labels) {
    const movedColumns = moveLabels(this.state.columns, labels);

    if (movedColumns) {
      // Retain widths to avoid flashing while drag and dropping.
      const source = movedColumns.columns[movedColumns.sourceIndex];
      const target = movedColumns.columns[movedColumns.targetIndex];

      const tmpClassName = source.props.className;
      source.props.className = target.props.className;
      target.props.className = tmpClassName;

      this.setState({
        columns: movedColumns.columns
      });
    }
  }
}
EasyTable.propTypes = {
  columns: React.PropTypes.array,
  rows: React.PropTypes.array,
  rowKey: React.PropTypes.string.isRequired,
  query: React.PropTypes.object,
  tableWidth: React.PropTypes.number.isRequired,
  tableHeight: React.PropTypes.number.isRequired,
  classNames: React.PropTypes.object,
  onRow: React.PropTypes.func
};
EasyTable.defaultProps = {
  classNames: {
    table: null,
    header: {
      wrapper: null
      // TODO
      /*
      row: null,
      cell: null
      */
    },
    body: {
      wrapper: null
      // TODO
      /*
      row: null,
      cell: null
      */
    }
  }
};

function getColumnClassName(id, i) {
  return `column-${id}-${i}`;
}

function moveLabels(columns, { sourceLabel, targetLabel }) {
  const sourceIndex = findIndex(
    columns,
    { header: { label: sourceLabel } }
  );

  if (sourceIndex < 0) {
    return null;
  }

  const targetIndex = findIndex(
    columns,
    { header: { label: targetLabel } }
  );

  if (targetIndex < 0) {
    return null;
  }

  return {
    sourceIndex,
    targetIndex,
    columns: move(columns, sourceIndex, targetIndex)
  };
}

function move(data, sourceIndex, targetIndex) {
  // Idea
  // a, b, c, d, e -> move(b, d) -> a, c, d, b, e
  // a, b, c, d, e -> move(d, a) -> d, a, b, c, e
  // a, b, c, d, e -> move(a, d) -> b, c, d, a, e
  const sourceItem = data[sourceIndex];

  // 1. detach - a, c, d, e - a, b, c, e, - b, c, d, e
  const ret = data.slice(0, sourceIndex).concat(
    data.slice(sourceIndex + 1)
  );

  // 2. attach - a, c, d, b, e - d, a, b, c, e - b, c, d, a, e
  return ret.slice(0, targetIndex).concat([sourceItem]).concat(
    ret.slice(targetIndex)
  );
}

const DragTypes = {
  HEADER: 'header'
};
const headerSource = {
  beginDrag({ label }) {
    return { label };
  }
};
const headerTarget = {
  hover(targetProps, monitor) {
    const targetLabel = targetProps.label;
    const sourceProps = monitor.getItem();
    const sourceLabel = sourceProps.label;

    if (sourceLabel !== targetLabel && targetProps.onMove) {
      targetProps.onMove({ sourceLabel, targetLabel });
    }
  }
};
const DndHeader = compose(
  DragSource( // eslint-disable-line new-cap
    DragTypes.HEADER, headerSource, connect => ({
      connectDragSource: connect.dragSource()
    })
  ),
  DropTarget( // eslint-disable-line new-cap
    DragTypes.HEADER, headerTarget, connect => ({
      connectDropTarget: connect.dropTarget()
    })
  )
)(({
  connectDragSource, connectDropTarget, label, // eslint-disable-line no-unused-vars
  children, onMove, ...props // eslint-disable-line no-unused-vars
}) => (
  connectDragSource(connectDropTarget(
    <th {...props}>{children}</th>
  ))
));
