import * as mysql from "mysql2";
import * as poolDataConnection from './settings/db-conn-local.json';
const poolData = mysql.createPool({
    host: poolDataConnection.dbhost,
    user: poolDataConnection.dbuser,
    password: poolDataConnection.dbpassword,
    database: poolDataConnection.dbname,
    port: poolDataConnection.dbport
});
export {
     poolData
}
