import React from 'react';
import { tableTypes, tableDefaults } from './types';

export default class Provider extends React.Component {
  getChildContext() {
    const { columns, components, data, rowKey } = this.props;

    return {
      columns,
      components: { ...components, ...tableDefaults.components.table },
      data,
      rowKey
    };
  }
  render() {
    const {
      columns, // eslint-disable-line no-unused-vars
      data, // eslint-disable-line no-unused-vars
      components,
      children,
      ...props
    } = this.props;

    return React.createElement(
      components.table || tableDefaults.components.table,
      props,
      children
    );
  }
}
Provider.propTypes = {
  ...tableTypes,
  children: React.PropTypes.any
};
Provider.defaultProps = {
  ...tableDefaults
};
Provider.childContextTypes = tableTypes;
