const botonChatbot = document.getElementById('btn-chatbot');
const ventanaChatbot = document.getElementById('chatbot-ventana');
const botonCerrarChatbot = document.getElementById('btn-cerrar-chatbot');

const inputChatbot = document.getElementById('chatbot-input');
const botonEnviarChatbot = document.getElementById('btn-enviar-chatbot');
const contenedorMensajes = document.getElementById('chatbot-mensajes');


/* =========================================
   MENÚ PRINCIPAL
========================================= */

const menuPrincipal = `
    <p>Selecciona una opción escribiendo su número:</p>

    <p>
        <strong>1.</strong> ¿Cómo realizar una reserva?<br>
        <strong>2.</strong> ¿Cómo consultar mis reservas?<br>
        <strong>3.</strong> ¿Cómo cancelar una reserva?<br>
        <strong>4.</strong> Información sobre Zona Jaguar<br>
        <strong>5.</strong> Reglas para acompañantes<br>
        <strong>6.</strong> Contactar a Vida Estudiantil
    </p>
`;


/* =========================================
   RESPUESTAS
========================================= */

const respuestasChatbot = {

    1: `
        <p><strong>¿Cómo realizar una reserva?</strong></p>

        <p>
            Desde la pantalla de inicio selecciona el espacio que deseas reservar:
            Fútbol, Baloncesto, Voleibol o Zona Jaguar.
        </p>

        <p>
            Luego selecciona la fecha, el horario disponible y completa los datos
            solicitados.
        </p>
    `,

    2: `
        <p><strong>¿Cómo consultar mis reservas?</strong></p>

        <p>
            Ingresa a la opción <strong>Mis reservas</strong> desde Mi perfil del sistema.
        </p>

        <p>
            Allí podrás consultar tus reservas aprobadas, pendientes, canceladas
            , rechazadas y vencidas.
        </p>
    `,

    3: `
        <p><strong>¿Cómo cancelar una reserva?</strong></p>

        <p>
            Entra en <strong>Mis reservas</strong>, selecciona la reserva que deseas
            cancelar y presiona el botón <strong>Cancelar reserva</strong>.
        </p>

        <p>
            Deberás escribir el motivo de la cancelación antes de confirmar.
        </p>
    `,

    4: `
        <p><strong>Zona Jaguar</strong></p>

        <p>
            La Zona Jaguar incluye espacios recreativos y juegos disponibles
            para los estudiantes.
        </p>

        <p>
            Las reservas de esta área pueden quedar en estado
            <strong>pendiente</strong> hasta que sean revisadas por el personal y aprobadas.
        </p>
    `,

    5: `
        <p><strong>Reglas para acompañantes</strong></p>

        <p>
            Puedes indicar la cantidad de acompañantes al momento de realizar
            la reserva.
        </p>

        <p>
            Todos los acompañantes deben ser estudiantes matriculados y llenar el formulario que muestra el QR.
        </p>
    `,

    6: `
        <p><strong>Contactar a Vida Estudiantil</strong></p>

        <p>
            Si necesitas ayuda con una reserva, puedes comunicarte directamente
            con el personal de Vida Estudiantil.
        </p>

        <p>
            Próximamente agregaremos aquí el correo, teléfono o ubicación
            correspondiente.
        </p>
    `

};


/* =========================================
   ABRIR Y CERRAR CHATBOT
========================================= */

botonChatbot.addEventListener('click', function(){

    ventanaChatbot.classList.add('activo');

    setTimeout(function(){
        inputChatbot.focus();
    }, 300);

});


botonCerrarChatbot.addEventListener('click', function(){

    ventanaChatbot.classList.remove('activo');

});


/* =========================================
   CREAR MENSAJE DEL USUARIO
========================================= */

function agregarMensajeUsuario(texto){

    const mensaje = document.createElement('div');

    mensaje.classList.add('mensaje-usuario');

    mensaje.innerHTML = `
        <div class="mensaje-usuario-contenido">

            <div class="mensaje-usuario-burbuja">
                ${texto}
            </div>

            <span class="mensaje-hora mensaje-hora-usuario">
                Ahora
            </span>

        </div>
    `;

    contenedorMensajes.appendChild(mensaje);

    desplazarChat();

}


/* =========================================
   CREAR MENSAJE DEL BOT
========================================= */

function agregarMensajeBot(contenido){

    const mensaje = document.createElement('div');

    mensaje.classList.add('mensaje-bot');

    mensaje.innerHTML = `
        <div class="mensaje-avatar">
            🐆
        </div>

        <div class="mensaje-contenido">

            <div class="mensaje-burbuja">
                ${contenido}
            </div>

            <span class="mensaje-hora">
                Ahora
            </span>

        </div>
    `;

    contenedorMensajes.appendChild(mensaje);

    desplazarChat();

}


/* =========================================
   MOSTRAR INDICADOR "ESCRIBIENDO"
========================================= */

function mostrarEscribiendo(){

    const indicador = document.createElement('div');

    indicador.classList.add('mensaje-bot');
    indicador.id = 'chatbot-escribiendo';

    indicador.innerHTML = `
        <div class="mensaje-avatar">
            🐆
        </div>

        <div class="mensaje-contenido">

            <div class="mensaje-burbuja escribiendo">
                <span></span>
                <span></span>
                <span></span>
            </div>

        </div>
    `;

    contenedorMensajes.appendChild(indicador);

    desplazarChat();

}


function ocultarEscribiendo(){

    const indicador = document.getElementById('chatbot-escribiendo');

    if(indicador){
        indicador.remove();
    }

}


/* =========================================
   PROCESAR OPCIÓN
========================================= */

function procesarMensaje(){

    const mensaje = inputChatbot.value.trim();

    if(mensaje === ''){
        return;
    }

    agregarMensajeUsuario(mensaje);

    inputChatbot.value = '';

    mostrarEscribiendo();

    setTimeout(function(){

        ocultarEscribiendo();

        if(respuestasChatbot[mensaje]){

            agregarMensajeBot(respuestasChatbot[mensaje]);

            setTimeout(function(){

                agregarMensajeBot(`
                    <p>
                        Escribe <strong>0</strong> para volver al menú principal.
                    </p>
                `);

            }, 400);

        }else if(mensaje === '0'){

            agregarMensajeBot(menuPrincipal);

        }else{

            agregarMensajeBot(`
                <p>
                    No reconocí esa opción. 😕
                </p>

                <p>
                    Escribe un número del <strong>1 al 6</strong>
                    o escribe <strong>0</strong> para ver el menú.
                </p>
            `);

        }

    }, 650);

}


/* =========================================
   BOTÓN Y TECLA ENTER
========================================= */

botonEnviarChatbot.addEventListener('click', procesarMensaje);


inputChatbot.addEventListener('keydown', function(event){

    if(event.key === 'Enter'){

        event.preventDefault();

        procesarMensaje();

    }

});


/* =========================================
   DESPLAZAR AL ÚLTIMO MENSAJE
========================================= */

function desplazarChat(){

    contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;

}