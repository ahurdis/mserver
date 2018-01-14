﻿/**
 * GraphUtilities.js
 * @author Andrew
 */

'use strict';

var url = require('url');
var queryString = require('querystring');
var Serialization = require('./Serialization');
var Graph = require('../graph/Graph.js');
var GraphData = require('../graph/GraphData.js');

function GraphUtilities() { };

// A list of constructors the smart reviver should know about  
Serialization.Reviver.constructors = { 'GraphData': GraphData, 'Graph': Graph };

GraphUtilities.inflateEdge = function (graph, edge, vertexType) {

  if (graph && edge && vertexType) {

    var edgeState = edge.getState();
    var vertexState = {
      argumentName: edgeState.argumentName,
      filterProperties: edgeState.filterProperties,
      type: vertexType
    };

    // for each edge, create a new node with the properties that the edge had
    var vertex = graph.addVertex(vertexState);

    // creates edges to the previous nodes with the properties that the edge had
    var sourceVertex = graph.getVertexById(edge.sourceId);
    var targetVertex = graph.getVertexById(edge.targetId);

    var upstreamEdge = {
      argumentName: sourceVertex.outboundType,
      filterProperties: edgeState.filterProperties
    };

    // are we being passed as a function parameter
    // or to a entire vertex
    var downstreamArgumentName;
    if (targetVertex.type === 'FunctionControl') {
      downstreamArgumentName = edgeState.argumentName;
    } else {
      downstreamArgumentName = targetVertex.inboundType;
    }

    var downstreamEdge = {
      argumentName: downstreamArgumentName,
      filterProperties: edgeState.filterProperties
    };

    // remove the edge from the graph
    graph.removeEdge(edge);

    graph.addEdge(sourceVertex, vertex, upstreamEdge);
    graph.addEdge(vertex, targetVertex, downstreamEdge);
  }
};

// inflate turns existing edges into nodes, preserving the connections
GraphUtilities.inflate = function (graph) {
  var edges = graph.getAllEdges();

  for (var i = 0; i < edges.length; i++) {

    var sourceVertexType = graph.getVertexById(edges[i].sourceId).outboundType;
    var targetVertexType = graph.getVertexById(edges[i].targetId).inboundType;

    // if the source is a PhysicalEntityControl or a FileControl
    // inflate the graph to support filtering of attributes
    if (['PhysicalEntityControl', 'SplitterControl', 'CSVFileControl', 'JSONFileControl', 'XMLFileControl'].includes(graph.getVertexById(edges[i].sourceId).type)) {
      GraphUtilities.inflateEdge(graph, edges[i], 'FilterProperties');
    }

    // support type conversations
    if (sourceVertexType !== targetVertexType && sourceVertexType === 'o' && targetVertexType === 'aro') {
      GraphUtilities.inflateEdge(graph, edges[i], 'o2aro');
    }
  }
};

GraphUtilities.parseGraph = function (req) {
  // parses the request url
  var theUrl = url.parse(req.url);

  // gets the query part of the URL and parses it creating an object
  var queryObj = queryString.parse(theUrl.query);

  var o;

  try {
    o = JSON.parse(queryObj.jsonData, Serialization.Reviver);
  }
  catch (e) {
    console.log(e);
  }
  // and jsonData will be a property of it
  return o;
};

GraphUtilities.getGraph = function (req, res) {
  return GraphUtilities.parseGraph(req);
};

GraphUtilities.getOutputVertex = function (graph) {
  let vertices = graph.getVertices();

  let ret = null;

  // look for the OutputControl
  vertices.forEach(function (v) {
      if (v.type === 'OutputControl') {
          ret = v;
      }
  });

  return ret;
};


module.exports = GraphUtilities;