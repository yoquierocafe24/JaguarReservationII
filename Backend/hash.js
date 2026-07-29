const bcrypt = require("bcryptjs");

async function generar() {

    const hash = await bcrypt.hash("Guardia1", 10);

    console.log(hash);

}

generar();