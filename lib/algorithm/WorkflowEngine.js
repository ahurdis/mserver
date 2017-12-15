/**
 * @author Andrew
 */

"use strict";

let Graph = require('../graph/Graph.js');
let KnexHelper = require('../utility/KnexHelper');
var mongodb = require('mongodb');
let CSVReader = require('../utility/CSVReader');
let ControlLibrary = require('../model/ControlLibrary');
let fs = require('fs');
let _ = require('underscore');

function WorkflowEngine(options) {

    let self = this;

    self._graph = options.graph;
    let connectionInfo = {};
    let _root = null;

    let log = console.log.bind(console);
    let err = console.error.bind(console);

    Object.values = Object.values || (obj => Object.keys(obj).map(key => obj[key]));

    self.create = async function () {

        let vertices = self._graph.getVertices();

        for (let vertex of vertices) {

            if (vertex.database) {

                const db = await mongodb.MongoClient.connect('mongodb://localhost:27017/mdb');

                // Don't `await`, instead get a cursor
                const cursor = db.collection('Credentials').find({ database: vertex.database });
                // Use `next()` and `await` to exhaust the cursor
                // note that we only expect one record, but I'm going to use the 
                for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {

                    connectionInfo[vertex.database + '.' + vertex.instance] = {
                        host: doc.host,
                        user: doc.user,
                        password: doc.password,
                        database: doc.database
                    };
                }
            }
        };
    };

    self.go = function (req, res) {
        let runEngine = coroutine(recurseTree);

        // set up the root node
        _root = getOutputVertex(self._graph);

        if (_root) {
            let engineResult = runEngine().then(function (value) {
                console.log('End of engine run.')

                let str = JSON.stringify([{ x: root.instance + ' logged on server.' }]);

                let rootValue = _root.functionValue;

                if (_root.type === 'OutputControl' && _root.instance === 'Grid') {
                    // send the response back to the server
                    str = JSON.stringify(rootValue);

                } else if (_root.type === 'OutputControl' && _root.instance === 'CSVFile') {
                    // write out to a JSON file

                    if (rootValue && rootValue.length >= 1) {

                        let logger = fs.createWriteStream('filedata/log.csv', {
                            flags: 'w' // 'w' means (over)wright
                        });

                        var headerKeys = Object.keys(rootValue[0]);
                        logger.write(headerKeys.join() + '\n');

                        for (var i = 0; i < rootValue.length; i++) {
                            var rowValues = Object.values(rootValue[i]);
                            logger.write(rowValues.join() + '\n');
                        }

                        logger.end();

                        console.log('CSV file saved!');
                    }

                } else if (_root.type === 'OutputControl' && _root.instance === 'JSONFile') {
                    // pretty print to a JSON file
                    fs.writeFile('filedata/log.json', JSON.stringify(rootValue, null, '\t'), (err) => {
                        if (err) throw err;
                        console.log('JSON file saved!');
                    });

                } else {
                    console.log(JSON.stringify(rootValue));
                }

                res.end("runWorkflowCallback('" + str + "')");
            });
        } else {
            console.log('No output vertex detected!');
        }
    };

    var knexHelper = new KnexHelper();

    let getVertexFunction = function (vertex) {

        let fRet = null;

        console.log(vertex.type + ' : ' + vertex.instance);
        /*
                if (vertex.type === 'FunctionControl' && vertex.instance === 'Distinct') {
                    fRet = function (aro, key) {
                        return _.uniq(aro, 
                            (obj) => { 
                                return obj[key]
                             }
                            );
                    };
                }
                else
        */
        if (vertex.type === 'FunctionControl') {
            fRet = ControlLibrary[vertex.instance].gd.func;
        }
        else
            if (vertex.type === 'PhysicalEntityControl') {

                var knex = require('knex')({
                    client: 'mysql',
                    connection: connectionInfo[vertex.database + '.' + vertex.instance]
                });

                fRet = function () {

                    return knex.select(...vertex.displayKeys).from(vertex.instance);
                }
            }
            else
                // this is an injected vertex function
                if (vertex.type === 'FilterProperties') {

                    fRet = function (aro) {

                        if (aro && Array.isArray(aro) && vertex.filterProperties) {
                            for (var i = 0; i < aro.length; i++) {
                                aro[i] = _.pick(aro[i], vertex.filterProperties);
                            }
                        }
                        return aro;
                    }

                }
                else
                    // this is an injected vertex function
                    if (vertex.type === 'o2aro') {
                        fRet = function (o) {
                            return [o];
                        };
                    }
                    else
                        if (vertex.type === 'FileControl') {

                            // get the real file for the given sourceName

                            let options = {
                                vertex: vertex
                            };

                            let csvReader = new CSVReader(options);

                            fRet = function () { return csvReader.read() };
                        }
                        else
                            if (vertex.type === 'FormControl') {
                                fRet = function () {

                                    let v = vertex.value;

                                    let retVal = v['ID_NAME_EDIT'];

                                    return retVal;
                                };
                            }
                            else
                                if (vertex.type === 'OutputControl' && vertex.instance === 'CSVFile') {
                                    fRet = function (aro) {

                                        //            console.log('Sending data to CSV File');

                                        return aro;
                                    }
                                }
                                else
                                    if (vertex.type === 'OutputControl' && vertex.instance === 'JSONFile') {
                                        fRet = function (aro) {

                                            //            console.log('Sending data to JSON File');

                                            return aro;
                                        }
                                    }
                                    else
                                        if (vertex.type === 'OutputControl' && vertex.instance === 'Grid') {
                                            fRet = function (aro) {

                                                //            console.log('Sending data to grid control');
                                                return aro;
                                            }
                                        }

        return fRet;
    };

    function coroutine(generatorFn) {
        return function co(...args) {
            let generator = generatorFn(...args);

            function handle(result) {
                // console.log('Result: ' + result.value.toString());


                if (result.done) {

                    return Promise.resolve(result.value);
                } else {

                    return Promise.resolve(result.value)
                        .then(
                        res => handle(generator.next(res)),
                        err => handle(generator.throw(err))
                        );
                }
            }

            try {
                return handle(generator.next());
            } catch (err) {
                return Promise.reject(err);
            }
        };
    }

    let getEdgesOrderedByFunctionArgument = function (vertex) {

        let edges = self._graph.getEdgesTo(vertex);

        let vertexFunction = getVertexFunction(vertex);
        // now sort the edges by the parameter list 
        let functionArguments = getFunctionArguments(vertexFunction);

        let edgesRet = [];

        for (let i in functionArguments) {

            // get the index of the function argument in the edges.argumentName
            let index = _.findIndex(edges, { argumentName: functionArguments[i] });
            if (index > -1) {
                edgesRet.push(edges[index]);
            }
        }

        return edgesRet;
    };

    function* recurseTree(vertex = _root) {

        let edges = getEdgesOrderedByFunctionArgument(vertex);

        let vertexFunction = getVertexFunction(vertex);

        // let orderedEdges = getEdgesOrderedByFunctionArgument(vertexFunction);

        let myValue = null;

        let accumulator = [];

        console.log(vertex.instance);

        for (let i in edges) {

            let child = self._graph.getVertexById(edges[i].sourceId);

            yield* recurseTree(child);

            // get the function for this vertex
            let childFunction = getVertexFunction(child);

            // execute the child function or reuse the value from the cache

            let childFunctionRet = null;

            if (typeof (child.functionValue) === 'undefined') {

                childFunctionRet = childFunction();
                // cache the value in the vertex
                child.functionValue = childFunctionRet;
            } else {
                childFunctionRet = child.functionValue;
            }

            // add the value to the accumator
            accumulator.push(yield childFunctionRet);
        }

        if (accumulator.length !== 0) {

            let functionRet = vertexFunction(...accumulator);

            vertex.functionValue = functionRet;

            yield functionRet;
        }
    };

    let getFunctionArguments = function (func) {
        return (func + '')
            .replace(/[/][/].*$/mg, '') // strip single-line comments
            .replace(/\s+/g, '') // strip white space
            .replace(/[/][*][^/*]*[*][/]/g, '') // strip multi-line comments  
            .split('){', 1)[0].replace(/^[^(]*[(]/, '') // extract the parameters  
            .replace(/=[^,]+/g, '') // strip any ES6 defaults  
            .split(',').filter(Boolean); // split & filter [""]
    };

    let getOutputVertex = function (graph) {

        try {
            let vertices = graph.getVertices();

            let ret = null;

            // look for the OutputControl
            vertices.forEach(function (v) {
                if (v.type === 'OutputControl') {
                    ret = v;
                }
            });
            /*
                        // look for the vertex without any outbound edges
                        vertices.forEach(function (v) {
                            if (graph.getEdges(v).length === 0) {
                                ret = v;
                            }
                        });
            */

            return ret;
        }
        catch (e) {
            console.log(e.message);
        }
    };
};

module.exports = WorkflowEngine;