function normalizarTexto(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    return String(valor).trim();
}

function encabezadosNormalizados(encabezados = []) {
    return encabezados.map((valor) =>
        normalizarTexto(valor)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
    );
}

function buscarIndicePorNombre(encabezados, nombres) {
    const normalizados = encabezadosNormalizados(encabezados);

    for (const nombre of nombres) {
        const indice = normalizados.findIndex((actual) => actual === nombre);
        if (indice !== -1) {
            return indice;
        }
    }

    return -1;
}

function resolverCamposEstudiante(fila = [], encabezados = []) {
    const filaNormalizada = Array.isArray(fila) ? fila : [];
    const columnas = encabezadosNormalizados(encabezados);

    const getByIndex = (indice, fallback) => {
        if (filaNormalizada[indice] === undefined || filaNormalizada[indice] === null) {
            return fallback;
        }

        return normalizarTexto(filaNormalizada[indice]);
    };

    const cuenta =
        buscarIndicePorNombre(columnas, ['cuenta', 'numero_cuenta', 'no_cuenta', 'ncuenta']) !== -1
            ? getByIndex(buscarIndicePorNombre(columnas, ['cuenta', 'numero_cuenta', 'no_cuenta', 'ncuenta']), '')
            : getByIndex(0, '');

    const nombre =
        buscarIndicePorNombre(columnas, ['nombre', 'nombre_completo', 'alumno']) !== -1
            ? getByIndex(buscarIndicePorNombre(columnas, ['nombre', 'nombre_completo', 'alumno']), '')
            : getByIndex(1, '');

    const dni =
        buscarIndicePorNombre(columnas, ['dni', 'documento', 'identidad']) !== -1
            ? getByIndex(buscarIndicePorNombre(columnas, ['dni', 'documento', 'identidad']), '')
            : getByIndex(2, '');

    const correo =
        buscarIndicePorNombre(columnas, ['correo', 'email', 'correo_institucional']) !== -1
            ? getByIndex(buscarIndicePorNombre(columnas, ['correo', 'email', 'correo_institucional']), '')
            : getByIndex(30, '');

    const carrera =
        buscarIndicePorNombre(columnas, ['carrera', 'programa', 'carrera_academica']) !== -1
            ? getByIndex(buscarIndicePorNombre(columnas, ['carrera', 'programa', 'carrera_academica']), '')
            : getByIndex(7, '');

    const tipoIngreso =
        buscarIndicePorNombre(columnas, ['tipo_ingreso', 'ingreso', 'tipoingreso']) !== -1
            ? getByIndex(buscarIndicePorNombre(columnas, ['tipo_ingreso', 'ingreso', 'tipoingreso']), '')
            : getByIndex(10, '');

    return {
        cuenta,
        nombre,
        dni,
        correo,
        carrera,
        tipo_ingreso: tipoIngreso
    };
}

module.exports = {
    resolverCamposEstudiante
};
