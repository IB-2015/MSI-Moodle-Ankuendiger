'use strict';

// logging: https://cloud.google.com/logging/docs/setup/nodejs?hl=de
const winston = require('winston');

// Imports the Google Cloud client library for Winston
const { LoggingWinston } = require('@google-cloud/logging-winston');

const loggingWinston = new LoggingWinston();

// Create a Winston logger that streams to Stackdriver Logging
// Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    // Add Stackdriver Logging
    loggingWinston,
  ],
});

// Import the Dialogflow module from the Actions on Google client library.
const { dialogflow } = require('actions-on-google');

// Import the firebase-functions package for deployment.
const functions = require('firebase-functions');

// Instantiate the Dialogflow client.
const app = dialogflow({ debug: true });

// msiService client
const axios = require('axios').default;

const msiService = axios.create({
  baseURL: 'http://35.247.197.48:3000/',
  // timeout: 2000,
});

app.intent('setCourses', async (conv, { Kurs }) => {

  try {
    const { data } = await msiService.post(`/moodle`,
      {
        // POST, PUT, PATCH body params
        data: {
          courses: Kurs
        }
      });

    const notificationIndex = 0;

    // save conversation data
    conv.data.notifications = data;
    conv.data.notificationIndex = notificationIndex;
    conv.ask(data[notificationIndex].header);
  } catch (error) {
    logger.error(JSON.stringify(error));
    conv.close('Etwas lief falsch');
  }
});

app.intent('nextTopic', (conv, params) => {
  conv.data.notificationIndex++;
  if (conv.data.notificationIndex < conv.data.notifications.length) {
    conv.ask(conv.data.notifications[conv.data.notificationIndex].header);
  } else {
    conv.close('Es gibt keine weiteren Ankündigungen. Ciao und vielen Dank, dass du den Moodle Ankündiger genutzt hast!');
  }
});

app.intent('nextPost', async (conv, params) => {
  const { notifications, notificationIndex } = conv.data;

  try {
    const { data } = await msiService.get(`/moodle`,
      {
        // GET query params
        params: {
          course: notifications[notificationIndex].course,
          topicIndex: notifications[notificationIndex].topicIndex,
          postIndex: notifications[notificationIndex].postIndex + 1
        },
      });

    logger.info(`GET nextPost: /moodle ${notifications[notificationIndex].course}, ${notifications[notificationIndex].topicIndex}, ${notifications[notificationIndex].postIndex + 1}`);
    conv.data.notifications[notificationIndex] = data;
    conv.ask(data.header);
  } catch (error) {
    logger.error(JSON.stringify(error));
    conv.close('Etwas lief falsch');
  }
});

app.intent('readWholePost', (conv, params) => {
  const { notifications, notificationIndex } = conv.data;
  conv.ask(notifications[notificationIndex].body);
});

// Set the DialogflowApp object to handle the HTTPS POST request.
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);