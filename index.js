const axios = require('axios');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const base64Image = require("./imagen_reporte_mensual.json");
const sharp = require("sharp");
const moment = require('moment');
const { consultaVista } = require('./athena-queries');
// Used in debug only
const fs = require('fs');
const { Console } = require('console');
// Configuracion regional y formatos
moment.locale('es');
process.env['FONTCONFIG_PATH'] = './fonts';

// Variables de entorno
const isDebugEnabled = process.env.DEBUG === "true";
const vistaUsuarios = process.env.NOMBRE_VISTA_USUARIOS;
const vistaAreasNominadas = process.env.NOMBRE_VISTA_AREAS_NOMINADAS;
const vistaAreasNominadoras = process.env.NOMBRE_VISTA_AREAS_NOMINADORAS;
const vistaValores = process.env.NOMBRE_VISTA_VALORES;
const apiUrl = process.env.API_URL;
const outputBucket = process.env.S3_OUTPUT_BUCKET;
if (!vistaUsuarios || !vistaAreasNominadas || !vistaAreasNominadoras || !vistaValores || !apiUrl || !outputBucket) {
    throw new Error('Faltan declarar alguna variable de entorno: NOMBRE_VISTA_USUARIOS | NOMBRE_VISTA_USUARIOS | NOMBRE_VISTA_AREAS_NOMINADAS | NOMBRE_VISTA_AREAS_NOMINADORAS | NOMBRE_VISTA_VALORES | API_URL | S3_OUTPUT_BUCKET');
}

function escapeXml(unsafe) {
    safeString = String(unsafe);
    if (safeString.length > 17) { 
        safeString = safeString.substring(0, 15) + "...";  //15 Recorta y agrega elipsis
    }
    return safeString.replace(/&/g, "&amp;") // Escapa algunos caracteres especiales
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

const procesarDatosVistas = (mesActual, datosVistaValores, datosVistaUsuarios, datosVistaAreasNominaciones, datosVistaAreasNominadoras) => {
    // Procesa los datos de los valores
    const valoresLikes = datosVistaValores.length > 1 ? {
        Flexibilidad: datosVistaValores[1][2],
        Eficiencia: datosVistaValores[1][3],
        Integridad: datosVistaValores[1][4],
        Liderazgo: datosVistaValores[1][5]
    } : { Flexibilidad: 0, Eficiencia: 0, Integridad: 0, Liderazgo: 0 };
    // Procesa los datos de usuarios nominados
    const nominados = datosVistaUsuarios.slice(1).map(fila => ({
        nominado: fila[3],
        likes: fila[2]
    })).slice(0, 5);
    // Procesa los datos de las areas nominadas
    const areasNominadas = datosVistaAreasNominaciones.slice(1).map(fila => ({
        area: fila[3],
        likes: fila[2]
    })).slice(0, 5);
    // Procesa los datos de las areas nominadoras
    const areasNominadoras = datosVistaAreasNominadoras.slice(1).map(fila => ({
        area: fila[3],
        likes: fila[2]
    })).slice(0, 5);
    const mesLikes = parseInt(valoresLikes.Eficiencia) + parseInt(valoresLikes.Flexibilidad) + parseInt(valoresLikes.Liderazgo) + parseInt(valoresLikes.Integridad);
    return {
        mes: mesActual,
        // Likes del mes
        mesLikes: mesLikes,
        mesLikesEficiencia: valoresLikes.Eficiencia,
        mesLikesFlexibilidad: valoresLikes.Flexibilidad,
        mesLikesLiderazgo: valoresLikes.Liderazgo,
        mesLikesIntegridad: valoresLikes.Integridad,
        // Top users que recibieron mas likes - Likes
        topUserLikes1: nominados.length > 0 ? nominados[0].likes : "",
        topUserLikes2: nominados.length > 0 ? nominados[1].likes : "",
        topUserLikes3: nominados.length > 0 ? nominados[2].likes : "",
        topUserLikes4: nominados.length > 0 ? nominados[3].likes : "",
        topUserLikes5: nominados.length > 0 ? nominados[4].likes : "",
        // Top users que recibieron mas likes - Users
        topUser1: nominados.length > 0 ? nominados[0].nominado : "",
        topUser2: nominados.length > 0 ? nominados[1].nominado : "",
        topUser3: nominados.length > 0 ? nominados[2].nominado : "",
        topUser4: nominados.length > 0 ? nominados[3].nominado : "",
        topUser5: nominados.length > 0 ? nominados[4].nominado : "",
        // Top areas que recibieron mas likes
        topAreaRec1: areasNominadas.length > 0 ? areasNominadas[0].area : "",
        topAreaRec2: areasNominadas.length > 0 ? areasNominadas[1].area : "",
        topAreaRec3: areasNominadas.length > 0 ? areasNominadas[2].area : "",
        topAreaRec4: areasNominadas.length > 0 ? areasNominadas[3].area : "",
        topAreaRec5: areasNominadas.length > 0 ? areasNominadas[4].area : "",
        // Top areas que dieron mas likes
        topAreaRem1: areasNominadoras.length > 0 ? areasNominadoras[0].area : "",
        topAreaRem2: areasNominadoras.length > 0 ? areasNominadoras[1].area : "",
        topAreaRem3: areasNominadoras.length > 0 ? areasNominadoras[2].area : "",
        topAreaRem4: areasNominadoras.length > 0 ? areasNominadoras[3].area : "",
        topAreaRem5: areasNominadoras.length > 0 ? areasNominadoras[4].area : ""
    };
};

async function addTextOnImage(params) {
    isDebugEnabled && console.log('addTextOnImage - Params a agregar a imagen: ', params);
    const {
        mes = "",
        // Likes del mes
        mesLikes = "",
        mesLikesEficiencia = "",
        mesLikesFlexibilidad = "",
        mesLikesLiderazgo = "",
        mesLikesIntegridad = "",

        // Top users que recibieron mas likes
        topUserLikes1 = "",
        topUserLikes2 = "",
        topUserLikes3 = "",
        topUserLikes4 = "",
        topUserLikes5 = "",

        // Top users que recibieron mas likes
        topUser1 = "",
        topUser2 = "",
        topUser3 = "",
        topUser4 = "",
        topUser5 = "",

        // Top areas que recibieron mas likes
        topAreaRec1 = "",
        topAreaRec2 = "",
        topAreaRec3 = "",
        topAreaRec4 = "",
        topAreaRec5 = "",

        // Top areas que dieron mas likes
        topAreaRem1 = "",
        topAreaRem2 = "",
        topAreaRem3 = "",
        topAreaRem4 = "",
        topAreaRem5 = ""
        //
    } = params;
    const width = 800;
    const height = 1549;
    // Arial, sans-serif
    const svgImage = `
    <svg width="${width}" height="${height}">
        <style>
        .mes { fill: white; font-size: 48px; font-family: Arial, sans-serif; font-weight: light;}
        .mes-likes { fill: white; font-size: 25px; font-family: Arial, sans-serif; font-weight: bold;}
        .mes-valores { fill: #67c2ef; font-size: 40px; font-family: Arial, sans-serif; font-weight: bold;}
        .user { fill: #214b9a; font-size: 18px; font-family: Arial, sans-serif; font-weight: normal;}
        .userLikes { fill: #1f4596; font-size: 18px; font-family: Arial, sans-serif; font-weight: bold;}
        .area { fill: #214b9a; font-size: 12px; font-family: Arial, sans-serif; font-weight: normal;}
        </style>
        <text x="400" y="243" text-anchor="start" class="mes">${escapeXml(mes)}!</text>
        <text x="262" y="390" text-anchor="middle" class="mes-likes">${escapeXml(mesLikes)}</text>

        <text x="254" y="471" text-anchor="middle" class="mes-valores">${escapeXml(mesLikesEficiencia)}</text>
        <text x="254" y="566" text-anchor="middle" class="mes-valores">${escapeXml(mesLikesLiderazgo)}</text> 
        <text x="520" y="471" text-anchor="middle" class="mes-valores">${escapeXml(mesLikesFlexibilidad)}</text>
        <text x="520" y="566" text-anchor="middle" class="mes-valores">${escapeXml(mesLikesIntegridad)}</text>

        <text x="312" y="760" text-anchor="start" class="user">${escapeXml(topUser1)}</text>
        <text x="312" y="814" text-anchor="start" class="user">${escapeXml(topUser2)}</text>
        <text x="312" y="862" text-anchor="start" class="user">${escapeXml(topUser3)}</text>
        <text x="525" y="760" text-anchor="start" class="user">${escapeXml(topUser4)}</text>
        <text x="525" y="815" text-anchor="start" class="user">${escapeXml(topUser5)}</text>

        <text x="285" y="759" text-anchor="middle" class="userLikes">${escapeXml(topUserLikes1)}</text>
        <text x="285" y="814" text-anchor="middle" class="userLikes">${escapeXml(topUserLikes2)}</text>
        <text x="285" y="862" text-anchor="middle" class="userLikes">${escapeXml(topUserLikes3)}</text>
        <text x="500" y="759" text-anchor="middle" class="userLikes">${escapeXml(topUserLikes4)}</text>
        <text x="500" y="815" text-anchor="middle" class="userLikes">${escapeXml(topUserLikes5)}</text>

        <text x="266" y="1060" text-anchor="start" class="area">${escapeXml(topAreaRec1)}</text>
        <text x="266" y="1083" text-anchor="start" class="area">${escapeXml(topAreaRec2)}</text>
        <text x="266" y="1106" text-anchor="start" class="area">${escapeXml(topAreaRec3)}</text>
        <text x="266" y="1129" text-anchor="start" class="area">${escapeXml(topAreaRec4)}</text>
        <text x="266" y="1152" text-anchor="start" class="area">${escapeXml(topAreaRec5)}</text>

        <text x="603" y="1060" text-anchor="start" class="area">${escapeXml(topAreaRem1)}</text>
        <text x="603" y="1083" text-anchor="start" class="area">${escapeXml(topAreaRem2)}</text>
        <text x="603" y="1106" text-anchor="start" class="area">${escapeXml(topAreaRem3)}</text>
        <text x="603" y="1129" text-anchor="start" class="area">${escapeXml(topAreaRem4)}</text>
        <text x="603" y="1152" text-anchor="start" class="area">${escapeXml(topAreaRem5)}</text>
    </svg>
    `;
    const svgBuffer = Buffer.from(svgImage);
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const image = await sharp(imageBuffer)
        .composite([
            {
                input: svgBuffer,
                top: 0,
                left: 0,
            },
        ])
        .toBuffer();
    const imageBase64 = image.toString('base64');
    // DEBUG
    if (isDebugEnabled) {
        const bucketName = 'testprueba123';
        const htmlKey = `trash/${Date.now()}.html`;
        try {
            const uploadResponse = await s3.putObject({
                Bucket: bucketName,
                Key: htmlKey,
                Body: `<img src="data:image/png;base64,${imageBase64}">`,
                ContentType: 'text/html'
            }).promise();

            console.log(`Archivo resultante exportado a: https://${bucketName}.s3.amazonaws.com/${htmlKey}`);
        } catch (error) {
            console.error(`Error al subir el archivo a S3. Error: ${error.message}`);
        }
    }
    return `data:image/png;base64,${imageBase64}`;
}

// AWS Lambda 
exports.handler = async (event) => {

    let body;
    try {
        const mesActual = moment().format('MMMM');
        const datosVistaValores = await consultaVista(vistaValores);
        const datosVistaUsuarios = await consultaVista(vistaUsuarios);
        const datosVistaAreasNominaciones = await consultaVista(vistaAreasNominadas);
        const datosVistaAreasNominadoras = await consultaVista(vistaAreasNominadoras);

        const datosVistas = procesarDatosVistas(mesActual, datosVistaValores, datosVistaUsuarios, datosVistaAreasNominaciones, datosVistaAreasNominadoras);

        try {
            body = JSON.stringify(datosVistas);
        } catch (error) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'El cuerpo resultante no es un JSON válido.' })
            };
        }
        //const result = await addTextOnImage(body);
        const result = await addTextOnImage(datosVistas);
        try {
            // Realiza la solicitud POST
            const response = await axios.post(apiUrl, {
                statusCode: 200,
                headers: { 'Content-Type': 'image/png' },
                body: result
            });
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Error al enviar HTTP POST REQUEST a ' + apiUrl })
            };
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "image/png" },
            body: result
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error interno del servidor.' })
        };
    }
};

// Test en localhost
/*
const param = {
    mes: "aaaa",
    // Likes del mes
    mesLikes: 1,
    mesLikesEficiencia: 2,
    mesLikesFlexibilidad: 3,
    mesLikesLiderazgo: 4,
    mesLikesIntegridad: 5,

    // Top users que recibieron mas likes
    topUserLikes1: "1",
    topUserLikes2: "2",
    topUserLikes3: "3",
    topUserLikes4: "4",
    topUserLikes5: "5",

    // Top users que recibieron mas likes
    topUser1: "Us 1",
    topUser2: "Us 2",
    topUser3: "Us 3",
    topUser4: "Us 4",
    topUser5: "Us 5",

    // Top areas que recibieron mas likes
    topAreaRec1: "Ar 1",
    topAreaRec2: "Ar 2",
    topAreaRec3: "Ar 3",
    topAreaRec4: "Ar 4",
    topAreaRec5: "Ar 5",
    // Top areas que dieron mas likes
    topAreaRem1: "Ar 1",
    topAreaRem2: "Ar 2",
    topAreaRem3: "Ar 3",
    topAreaRem4: "Ar 4",
    topAreaRem5: "Ar 5"
};
addTextOnImage(param).then((result) => {
    // console.log('data:image/jpeg;base64,' + result);
    fs.writeFile('result.html', '<img src="' + result + '">', (err) => {
        if (err) throw err;
        console.log('El archivo ha sido guardado.');
    });
});
*/