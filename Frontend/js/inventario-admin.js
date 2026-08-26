const API_URL =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : 'https://jaguarreservationii-production.up.railway.app';


let inventario = [];
let filtroActual = 'todos';
let idPendienteInactivar = null;


const modalItem =
    new bootstrap.Modal(
        document.getElementById('modalItem')
    );

const modalReservas =
    new bootstrap.Modal(
        document.getElementById('modalReservas')
    );


// =====================================
// SESIÓN ADMIN
// =====================================
async function verificarSesion() {

    try {

        const response = await fetch(
            `${API_URL}/api/auth/session`,
            {
                credentials: 'include'
            }
        );

        const data = await response.json();

        if (
            !response.ok ||
            !data.ok ||
            !data.usuario ||
            data.usuario.rol !== 'admin'
        ) {
            window.location.href =
                '../../login.html';
        }

    } catch (error) {

        window.location.href =
            '../../login.html';

    }

}


// =====================================
// CARGAR INVENTARIO
// =====================================
async function cargarInventario() {

    const tbody =
        document.getElementById(
            'tablaInventario'
        );

    tbody.innerHTML = `
        <tr>
            <td
                colspan="6"
                class="estado-tabla"
            >
                Cargando inventario...
            </td>
        </tr>
    `;

    try {

        const response = await fetch(
            `${API_URL}/api/inventario/items`,
            {
                credentials: 'include'
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.mensaje ||
                'No se pudo cargar el inventario.'
            );
        }

        inventario = data.items || [];

        actualizarResumen();
        renderInventario();

    } catch (error) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    class="estado-tabla"
                >
                    ${error.message}
                </td>
            </tr>
        `;

    }

}


// =====================================
// RESUMEN
// =====================================
function actualizarResumen() {

    const activos =
        inventario.filter(
            item => item.estado === 'activo'
        ).length;

    const inactivos =
        inventario.filter(
            item => item.estado === 'inactivo'
        ).length;

    document.getElementById(
        'totalItems'
    ).textContent = inventario.length;

    document.getElementById(
        'totalActivos'
    ).textContent = activos;

    document.getElementById(
        'totalInactivos'
    ).textContent = inactivos;

}


// =====================================
// RENDER
// =====================================
function renderInventario() {

    const tbody =
        document.getElementById(
            'tablaInventario'
        );

    const texto =
        document.getElementById(
            'buscarItem'
        ).value
            .trim()
            .toLowerCase();

    const filtrados = inventario.filter(item => {

        const coincideEstado =
            filtroActual === 'todos' ||
            item.estado === filtroActual;

        const coincideTexto =
            !texto ||
            String(item.nombre || '')
                .toLowerCase()
                .includes(texto) ||
            String(item.categoria || '')
                .toLowerCase()
                .includes(texto);

        return coincideEstado && coincideTexto;
    });


    if (filtrados.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    class="estado-tabla"
                >
                    No hay ítems para mostrar.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        filtrados.map(item => `

            <tr>

                <td>
                    <strong>
                        ${escapar(item.nombre)}
                    </strong>
                </td>

                <td>
                    ${escapar(item.categoria || 'Sin categoría')}
                </td>

                <td>
                    ${item.cantidad_total}
                </td>

                <td>
                    ${escapar(
                        item.descripcion || '—'
                    )}
                </td>

                <td>

                    <span
                        class="${
                            item.estado === 'activo'
                                ? 'badge-activo'
                                : 'badge-inactivo'
                        }"
                    >
                        ${
                            item.estado === 'activo'
                                ? 'Activo'
                                : 'Inactivo'
                        }
                    </span>

                </td>

                <td class="text-end">

                    <button
                        class="btn-accion btn-editar"
                        onclick="editarItem(${item.id_item})"
                        title="Editar"
                    >
                        <i class="bi bi-pencil"></i>
                    </button>

                    ${
                        item.estado === 'activo'
                            ? `
                                <button
                                    class="btn-accion btn-inactivar"
                                    onclick="inactivarItem(${item.id_item})"
                                    title="Inactivar"
                                >
                                    <i class="bi bi-slash-circle"></i>
                                </button>
                            `
                            : `
                                <button
                                    class="btn-accion btn-reactivar"
                                    onclick="reactivarItem(${item.id_item})"
                                    title="Reactivar"
                                >
                                    <i class="bi bi-arrow-counterclockwise"></i>
                                </button>
                            `
                    }

                </td>

            </tr>

        `).join('');

}


// =====================================
// NUEVO ITEM
// =====================================
document.getElementById(
    'btnNuevoItem'
).addEventListener(
    'click',
    () => {

        document.getElementById(
            'formItem'
        ).reset();

        document.getElementById(
            'itemId'
        ).value = '';

        document.getElementById(
            'modalItemTitulo'
        ).textContent =
            'Nuevo ítem';

        modalItem.show();

    }
);


// =====================================
// EDITAR ITEM
// =====================================
function editarItem(id) {

    const item =
        inventario.find(
            i => i.id_item === id
        );

    if (!item) return;

    document.getElementById(
        'itemId'
    ).value = item.id_item;

    document.getElementById(
        'nombreItem'
    ).value = item.nombre;

    document.getElementById(
        'categoriaItem'
    ).value = item.categoria || '';

    document.getElementById(
        'cantidadItem'
    ).value = item.cantidad_total;

    document.getElementById(
        'descripcionItem'
    ).value =
        item.descripcion || '';

    document.getElementById(
        'modalItemTitulo'
    ).textContent =
        'Editar ítem';

    modalItem.show();

}


// =====================================
// GUARDAR CREAR / EDITAR
// =====================================
document.getElementById(
    'formItem'
).addEventListener(
    'submit',
    async event => {

        event.preventDefault();

        const id =
            document.getElementById(
                'itemId'
            ).value;

        const nombre =
            document.getElementById(
                'nombreItem'
            ).value.trim();

        const categoria =
            document.getElementById(
                'categoriaItem'
            ).value.trim();

        const cantidad =
            Number(
                document.getElementById(
                    'cantidadItem'
                ).value
            );

        const descripcion =
            document.getElementById(
                'descripcionItem'
            ).value.trim();


        if (!nombre) {

            mostrarToast(
                'El nombre es obligatorio.',
                'error'
            );

            return;
        }

        if (!id && !categoria) {

            mostrarToast(
                'La categoría es obligatoria para nuevos ítems.',
                'error'
            );

            return;
        }


        if (
            !Number.isInteger(cantidad) ||
            cantidad < 0
        ) {

            mostrarToast(
                'La cantidad debe ser un número entero mayor o igual a cero.',
                'error'
            );

            return;
        }


        const payload = {
            nombre,
            categoria,
            cantidad_total: cantidad,
            descripcion
        };


        const url =
            id
                ? `${API_URL}/api/inventario/items/${id}`
                : `${API_URL}/api/inventario/items`;

        const metodo =
            id ? 'PUT' : 'POST';


        try {

            const response = await fetch(
                url,
                {
                    method: metodo,
                    headers: {
                        'Content-Type':
                            'application/json'
                    },
                    credentials: 'include',
                    body:
                        JSON.stringify(payload)
                }
            );

            const data =
                await response.json();

            if (!response.ok || !data.ok) {

                throw new Error(
                    data.mensaje ||
                    'No se pudo guardar el ítem.'
                );

            }


            /*
             * El backend permite editar aunque
             * la nueva cantidad sea inferior
             * a la reservada.
             */
            if (data.advertencia) {

                alert(
                    data.advertencia.mensaje
                );

            }


            modalItem.hide();

            mostrarToast(
                data.mensaje,
                'ok'
            );

            await cargarInventario();

        } catch (error) {

            mostrarToast(
                error.message,
                'error'
            );

        }

    }
);


// =====================================
// INACTIVAR
// =====================================
async function inactivarItem(id) {

    try {

        const response = await fetch(
            `${API_URL}/api/inventario/items/${id}/inactivar`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    confirmar: false
                })
            }
        );

        const data =
            await response.json();


        // El backend solicita confirmación
        if (
            response.status === 409 &&
            data.requiere_confirmacion
        ) {

            idPendienteInactivar = id;

            mostrarReservasAfectadas(
                data.reservas_afectadas || []
            );

            modalReservas.show();

            return;

        }


        if (!response.ok || !data.ok) {

            throw new Error(
                data.mensaje ||
                'No se pudo inactivar el ítem.'
            );

        }


        mostrarToast(
            data.mensaje,
            'ok'
        );

        await cargarInventario();

    } catch (error) {

        mostrarToast(
            error.message,
            'error'
        );

    }

}


// =====================================
// CONFIRMAR INACTIVACIÓN
// =====================================
document.getElementById(
    'btnConfirmarInactivacion'
).addEventListener(
    'click',
    async () => {

        if (!idPendienteInactivar) {
            return;
        }

        try {

            const response = await fetch(
                `${API_URL}/api/inventario/items/${idPendienteInactivar}/inactivar`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type':
                            'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        confirmar: true
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok || !data.ok) {

                throw new Error(
                    data.mensaje ||
                    'No se pudo inactivar.'
                );

            }


            modalReservas.hide();

            idPendienteInactivar = null;

            mostrarToast(
                data.mensaje,
                'ok'
            );

            await cargarInventario();

        } catch (error) {

            mostrarToast(
                error.message,
                'error'
            );

        }

    }
);


// =====================================
// REACTIVAR
// =====================================
async function reactivarItem(id) {

    try {

        const response = await fetch(
            `${API_URL}/api/inventario/items/${id}/reactivar`,
            {
                method: 'PATCH',
                credentials: 'include'
            }
        );

        const data =
            await response.json();

        if (!response.ok || !data.ok) {

            throw new Error(
                data.mensaje ||
                'No se pudo reactivar el ítem.'
            );

        }

        mostrarToast(
            data.mensaje,
            'ok'
        );

        await cargarInventario();

    } catch (error) {

        mostrarToast(
            error.message,
            'error'
        );

    }

}


// =====================================
// RESERVAS AFECTADAS
// =====================================
function mostrarReservasAfectadas(
    reservas
) {

    const tbody =
        document.getElementById(
            'tablaReservasAfectadas'
        );

    tbody.innerHTML =
        reservas.map(reserva => `

            <tr>

                <td>
                    ${escapar(
                        String(
                            reserva.id_reserva
                        )
                    )}
                </td>

                <td>
                    ${formatearFecha(
                        reserva.fecha
                    )}
                </td>

                <td>
                    ${formatearHora(
                        reserva.hora_inicio
                    )}
                    -
                    ${formatearHora(
                        reserva.hora_fin
                    )}
                </td>

                <td>
                    ${escapar(
                        reserva.estado
                    )}
                </td>

            </tr>

        `).join('');

}


// =====================================
// FILTROS
// =====================================
document.querySelectorAll(
    '.filtro-btn'
).forEach(button => {

    button.addEventListener(
        'click',
        () => {

            document.querySelectorAll(
                '.filtro-btn'
            ).forEach(btn =>
                btn.classList.remove(
                    'active'
                )
            );

            button.classList.add(
                'active'
            );

            filtroActual =
                button.dataset.filtro;

            renderInventario();

        }
    );

});


document.getElementById(
    'buscarItem'
).addEventListener(
    'input',
    renderInventario
);


// =====================================
// CERRAR SESIÓN
// =====================================
async function cerrarSesion() {

    try {

        await fetch(
            `${API_URL}/api/auth/logout`,
            {
                method: 'POST',
                credentials: 'include'
            }
        );

    } finally {

        window.location.href =
            '../../login.html';

    }

}


// =====================================
// UTILIDADES
// =====================================
function mostrarToast(
    mensaje,
    tipo = ''
) {

    const toast =
        document.getElementById(
            'inventarioToast'
        );

    toast.textContent = mensaje;

    toast.className =
        `inventario-toast ${tipo} show`;

    clearTimeout(
        toast._timeout
    );

    toast._timeout =
        setTimeout(
            () => {
                toast.classList.remove(
                    'show'
                );
            },
            2800
        );

}


function formatearFecha(valor) {

    if (!valor) return '—';

    const fecha =
        new Date(valor);

    return fecha.toLocaleDateString(
        'es-HN'
    );

}


function formatearHora(valor) {

    if (!valor) return '—';

    return String(valor)
        .substring(0, 5);

}


function escapar(valor) {

    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

}


// =====================================
// INICIO
// =====================================
document.addEventListener(
    'DOMContentLoaded',
    async () => {

        await verificarSesion();
        await cargarInventario();

    }
);