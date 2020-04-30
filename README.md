# MSI-Moodle-Ankuendiger

## client
Contains script to test the endpoints of service endpoints

run `npm install` and `node index.js` to run the script

## service
Contains the web scrapper for the moodle plattform and the REST server.

run `npm install` and `node index.js` to start the service

### Requirements
Selenium. Read the Docs to get started with [selenium](https://www.selenium.dev/)

## webhook
Contains the dialogfolw fulfillment webhook project.

### Requirements
`npm install firebase tools`

### Setup
`firebase login`

`firebase projects:list` : Get the ID of your project

`firebase deploy --project <Project-ID>` : deploy the webhook to the desired project