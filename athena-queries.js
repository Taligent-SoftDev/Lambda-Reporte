const AWS = require('aws-sdk');
const athena = new AWS.Athena();
const outputBucket = process.env.S3_OUTPUT_BUCKET;
const isDebugEnabled = process.env.DEBUG === "true";
if (!outputBucket) {
    throw new Error('Falta declarar variable de entorno S3_OUTPUT_BUCKET');
}

async function queryExecution(queryString) {
    const params = {
        QueryString: queryString,
        ResultConfiguration: { OutputLocation: `${outputBucket}` }
    };
    const startQueryResponse = await athena.startQueryExecution(params).promise();
    return startQueryResponse.QueryExecutionId;
}

async function getResults(queryExecutionId) {
    let queryStatus = 'RUNNING';
    isDebugEnabled && console.log('Estado inicial:', queryStatus);
    while (queryStatus === 'RUNNING' || queryStatus === 'QUEUED') {
        const data = await athena.getQueryExecution({ QueryExecutionId: queryExecutionId }).promise();
        queryStatus = data.QueryExecution.Status.State;
        isDebugEnabled && console.log('Estado actual:', queryStatus);
        if (queryStatus === 'SUCCEEDED') {
            const results = await athena.getQueryResults({ QueryExecutionId: queryExecutionId }).promise();
            return results.ResultSet.Rows.map((row) => row.Data.map((datum) => datum.VarCharValue));
        } else if (queryStatus === 'FAILED' || queryStatus === 'CANCELLED') {
            throw new Error('Consulta fallida o cancelada');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function consultaVista(nombreVista) {
    try {
        const query = `SELECT * FROM ${nombreVista};`;
        const queryId = await queryExecution(query);
        const results = await getResults(queryId);
        isDebugEnabled && console.log(`Resultados de ${nombreVista}:`, results);
        return results;
    } catch (error) {
        console.error(`Error al consultar la vista ${nombreVista}:`, error);
        throw error;
    }
}

module.exports = {
    consultaVista
};
