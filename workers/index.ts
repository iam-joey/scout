import dotenv from "dotenv";
import WebSocket from "ws"; // `npm install ws` or `yarn add ws` to install the ws package

dotenv.config();

const websocketUri = process.env.WS_URL; // Subscribe to Business or Premium plan here for Websocket API access - hhttps://alpha.vybenetwork.com/settings/plans - generate API key and get websocket URI here https://alpha.vybenetwork.com/settings/api-management

let ws:any;
const enableReconnect = true; // Set to false if you don't want to reconnect automatically

function getTimestamp() {
    return Math.floor(Date.now() / 1000); // Unix timestamp
}

function connect() {
    ws = new WebSocket(websocketUri as string, {
        headers: {
            "X-API-Key": process.env.VYBE_NETWORK_KEY, // Subscribe to Business or Premium plan here for Websocket API access - https://alpha.vybenetwork.com/settings/plans - and generate API key here https://alpha.vybenetwork.com/settings/api-management
        },
    });

    ws.on("open", () => {
        console.log("Connected to the WebSocket server " + getTimestamp());
        /**
         * On connection, send a configure message to specify the filters.
         *
         * For the demo, we are mixing and matching some pre-defined filters from filter-example.js, you can filter accordingly to your needs
         *
         *  Using an empty array for each data type will receive all messages with no filter, eg - trades: [], transfers: [], oraclePrices: []
         */
        const configureMessage = JSON.stringify({
            type: "configure",
            filters: {
                oraclePrices: [],
            },
        });

        ws.send(configureMessage);
    });

    ws.on("message", (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            console.log(parsedMessage)

            // You can now used the data in the parsedMessage object for your application or trading bot
        } catch (e) {
            console.error(`Failed to parse message: ${e}`);
            return;
        }
    });

    ws.on("close", () => {
        console.log("Connection closed.");
        if (enableReconnect) {
            attemptReconnect();
        }
    });

    ws.on("error", (error) => {
        console.error(`WebSocket error: ${error}`);
        if (enableReconnect) {
            attemptReconnect();
        }
    });
}

function attemptReconnect() {
    console.log("Attempting to reconnect...");
    connect();
}

// Start the initial connection
connect();