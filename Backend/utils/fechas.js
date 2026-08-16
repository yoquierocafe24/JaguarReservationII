function normalizarFechaISO(valor) {
    if (valor === null || valor === undefined || valor === '') {
        return null;
    }

    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) {
            return null;
        }

        const anio = valor.getFullYear();
        const mes = String(valor.getMonth() + 1).padStart(2, '0');
        const dia = String(valor.getDate()).padStart(2, '0');

        return `${anio}-${mes}-${dia}`;
    }

    if (typeof valor !== 'string') {
        return null;
    }

    const texto = valor.trim();

    if (!texto) {
        return null;
    }

    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(texto)) {
        const [anio, mes, dia] = texto.split('-');
        const fecha = new Date(`${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00`);

        if (!Number.isNaN(fecha.getTime())) {
            const ano = fecha.getFullYear();
            const mesFormateado = String(fecha.getMonth() + 1).padStart(2, '0');
            const diaFormateado = String(fecha.getDate()).padStart(2, '0');
            return `${ano}-${mesFormateado}-${diaFormateado}`;
        }
    }

    const normalizado = texto.replace(/\//g, '-');
    const fecha = new Date(`${normalizado}T00:00:00`);

    if (Number.isNaN(fecha.getTime())) {
        return null;
    }

    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');

    return `${anio}-${mes}-${dia}`;
}

function fechaActualHondurasISO() {
    const fecha = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

    return normalizarFechaISO(fecha);
}

module.exports = {
    normalizarFechaISO,
    fechaActualHondurasISO
};
