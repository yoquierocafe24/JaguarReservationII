const bcrypt = require("bcryptjs");

async function generar() {

    const hash = await bcrypt.hash("Jaguarreservas", 10);

    console.log(hash);

}

generar(); 