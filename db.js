const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "srv1000.hstgr.io",
  user: "u985593197_FiewinGames",
  password: "81975Nz@@", // change this
  database: "u985593197_FiewinGames",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


module.exports = pool;
