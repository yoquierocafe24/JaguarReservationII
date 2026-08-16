const bcrypt = require("bcryptjs");

async function generar() {

    const hash = await bcrypt.hash("Enero55.", 10);

    console.log(hash);

}

generar(); 