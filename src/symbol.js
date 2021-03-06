// @flow
import * as React from 'react';
import PropTypes from 'prop-types';
import type { SJSymbolMaster } from '@skpm/sketchapp-json-flow-types';
import { fromSJSONDictionary, toSJSON } from 'sketchapp-json-plugin';
import StyleSheet from './stylesheet';
import { generateID } from './jsonUtils/models';
import ViewStylePropTypes from './components/ViewStylePropTypes';
import buildTree from './buildTree';
import flexToSketchJSON from './flexToSketchJSON';
import { renderLayers } from './render';
import { resetLayer } from './resets';
import { getDocumentFromContext } from './utils/getDocument';

let id = 0;
const nextId = () => ++id; // eslint-disable-line

const displayName = (Component: React.ComponentType<any>): string =>
  Component.displayName || Component.name || `UnknownSymbol${nextId()}`;

let hasInitialized = false;
const symbolsRegistry = {};
let existingSymbols = [];
const layers = {};

const msListToArray = (pageList) => {
  const out = [];
  // eslint-disable-next-line
  for (let i = 0; i < pageList.length; i++) {
    out.push(pageList[i]);
  }
  return out;
};

export const getSymbolsPage = (document: any) => {
  const pages = document.pages();
  const array = msListToArray(pages);
  return array.find(p => String(p.name()) === 'Symbols');
};

const getExistingSymbols = (document: any) => {
  if (!hasInitialized) {
    hasInitialized = true;

    let symbolsPage = getSymbolsPage(document);
    if (!symbolsPage) {
      symbolsPage = document.addBlankPage();
      symbolsPage.setName('Symbols');
    }

    existingSymbols = msListToArray(symbolsPage.layers()).map((x) => {
      const symbolJson = JSON.parse(toSJSON(x));
      layers[symbolJson.symbolID] = x;
      return symbolJson;
    });

    existingSymbols.forEach((symbolMaster) => {
      if (symbolMaster._class !== 'symbolMaster') return;
      if (symbolMaster.name in symbolsRegistry) return;
      symbolsRegistry[symbolMaster.name] = symbolMaster;
    });
  }
  return existingSymbols;
};

const getSymbolID = (masterName: string): string => {
  let symbolId = generateID();

  existingSymbols.forEach((symbolMaster) => {
    if (symbolMaster.name === masterName) {
      symbolId = symbolMaster.symbolID;
    }
  });
  return symbolId;
};

export const injectSymbols = (document: any) => {
  if (!document) {
    document = getDocumentFromContext(context); // eslint-disable-line
  }
  const currentPage = document.currentPage();

  // if hasInitialized is false then makeSymbol has not yet been called
  if (hasInitialized) {
    const symbolsPage = document.documentData().symbolsPageOrCreateIfNecessary();

    let left = 0;
    Object.keys(symbolsRegistry).forEach((key) => {
      const symbolMaster = symbolsRegistry[key];
      symbolMaster.frame.y = 0;
      symbolMaster.frame.x = left;
      left += symbolMaster.frame.width + 20;

      const newLayer = fromSJSONDictionary(symbolMaster);
      layers[symbolMaster.symbolID] = newLayer;
    });

    // Clear out page layers to prepare for re-render
    resetLayer(symbolsPage);

    renderLayers(Object.keys(layers).map(k => layers[k]), symbolsPage);

    document.setCurrentPage(currentPage);
  }
};

export const createSymbolInstanceClass = (symbolMaster: SJSymbolMaster): React.ComponentType<any> =>
  class extends React.Component<any> {
    static symbolID = symbolMaster.symbolID;
    static masterName = symbolMaster.name;
    static displayName = `SymbolInstance(${symbolMaster.name})`;

    static propTypes = {
      style: PropTypes.shape(ViewStylePropTypes),
      name: PropTypes.string,
      overrides: PropTypes.object, // eslint-disable-line
      resizingConstraint: PropTypes.object, // eslint-disable-line
    };

    render() {
      return (
        <symbolinstance
          symbolID={symbolMaster.symbolID}
          name={this.props.name || symbolMaster.name}
          style={StyleSheet.flatten(this.props.style)}
          resizingConstraint={this.props.resizingConstraint}
          overrides={this.props.overrides}
        />
      );
    }
  };

export const makeSymbol = (
  Component: React.ComponentType<any>,
  name: string,
  document?: any,
): React.ComponentType<any> => {
  if (!hasInitialized) {
    getExistingSymbols(document || getDocumentFromContext(context));
  }

  const masterName = name || displayName(Component);
  const symbolID = getSymbolID(masterName);
  const symbolMaster = flexToSketchJSON(
    buildTree(
      <symbolmaster symbolID={symbolID} name={masterName}>
        <Component />
      </symbolmaster>,
    ),
  );

  symbolsRegistry[symbolID] = symbolMaster;
  return createSymbolInstanceClass(symbolMaster);
};

export const getSymbolMasterByName = (name: string): SJSymbolMaster => {
  const symbolID = Object.keys(symbolsRegistry).find(
    key => String(symbolsRegistry[key].name) === name,
  );

  if (typeof symbolID === 'undefined') {
    throw new Error('##FIXME## NO MASTER FOR THIS SYMBOL NAME');
  }

  return symbolsRegistry[symbolID];
};

export const getSymbolMasterById = (symbolID: ?string): SJSymbolMaster => {
  const symbolMaster = symbolID ? symbolsRegistry[symbolID] : undefined;
  if (typeof symbolMaster === 'undefined') {
    throw new Error('##FIXME## NO MASTER WITH THAT SYMBOL ID');
  }

  return symbolMaster;
};

export const getSymbolComponentByName = (masterName: string): React.ComponentType<any> =>
  createSymbolInstanceClass(getSymbolMasterByName(masterName));
