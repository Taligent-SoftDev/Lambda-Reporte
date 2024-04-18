
### Como ejecutar

1. Instalar dependencias para arquitectura de lambda. 
    - Para `arm64`:
       ~~~bash
       npm i --os=linux --cpu=arm64
       ~~~

3. Comprimir el proyecto a .zip.
4. En lambda:
    - Crear lambda con arquitectura de dependencias instaladas.
    - Subir el archivo .zip.
    - Declarar las siguientes variables de entorno:
    
      - **DEBUG** _(Opcional)_: Activa logs adicionales de debug cuando se establece en true. Default en false.
      - **NOMBRE_VISTA_USUARIOS** _(Obligatorio)_: Nombre de la vista en Athena para datos de usuarios.
      - **NOMBRE_VISTA_AREAS_NOMINADAS** _(Obligatorio)_: Nombre de la vista en Athena para áreas nominadas.
      - **NOMBRE_VISTA_AREAS_NOMINADORAS** _(Obligatorio)_: Nombre de la vista en Athena para áreas nominadoras.
      - **NOMBRE_VISTA_VALORES** _(Obligatorio)_: Nombre de la vista en Athena para valores de reconocimientos.
      - **API_URL** _(Obligatorio)_: URL del API donde se enviarán los informes generados.
      - **S3_OUTPUT_BUCKET** _(Obligatorio)_: Bucket de S3 donde se almacenan resultados temporales de consultas a Athena.

    - Configurar el evento trigger.
