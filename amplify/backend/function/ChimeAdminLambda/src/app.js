/*
Copyright 2017 - 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/


/* Amplify Params - DO NOT EDIT
You can access the following resource attributes as environment variables from your Lambda function
var environment = process.env.ENV
var region = process.env.REGION
var storageMeetingsName = process.env.STORAGE_MEETINGS_NAME
var storageMeetingsArn = process.env.STORAGE_MEETINGS_ARN
var storageAttendeesName = process.env.STORAGE_ATTENDEES_NAME
var storageAttendeesArn = process.env.STORAGE_ATTENDEES_ARN

Amplify Params - DO NOT EDIT */

var express = require('express')
var bodyParser = require('body-parser')
var awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
var AWS = require('aws-sdk');
var ddb = new AWS.DynamoDB();
const chime = new AWS.Chime({ region: 'us-east-1' });
chime.endpoint = new AWS.Endpoint('https://service.chime.aws.amazon.com/console');

// declare a new express app
var app = express()
app.use(bodyParser.json())
app.use(awsServerlessExpressMiddleware.eventContext())

// Enable CORS for all methods
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
});

const oneDayFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

// Read resource names from the environment
const meetingsTableName = process.env.STORAGE_MEETINGS_NAME;
const attendeesTableName = process.env.STORAGE_ATTENDEES_NAME;
//const sqsQueueArn = process.env.SQS_QUEUE_ARN;
//const provideQueueArn = process.env.USE_EVENT_BRIDGE === 'false';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const getMeeting = async(meetingTitle) => {
  const result = await ddb.getItem({
    TableName: meetingsTableName,
    Key: {
      'Title': {
        S: meetingTitle
      },
    },
  }).promise();
  if (!result.Item) {
    return null;
  }
  const meetingData = JSON.parse(result.Item.Data.S);
  return meetingData;
}

const putMeeting = async(title, meetingInfo) => {
  await ddb.putItem({
    TableName: meetingsTableName,
    Item: {
      'Title': { S: title },
      'Data': { S: JSON.stringify(meetingInfo.Meeting) },
      'TTL': {
        N: '' + oneDayFromNow
      }
    }
  }).promise();
}

const getAttendee = async(title, attendeeId) => {
  const result = await ddb.getItem({
    TableName: attendeesTableName,
    Key: {
      'AttendeeId': {
        S: `${title}/${attendeeId}`
      }
    }
  }).promise();
  if (!result.Item) {
    return 'Unknown';
  }
  return result.Item.Name.S;
}

const putAttendee = async(title, attendeeId, name) => {
  await ddb.putItem({
    TableName: attendeesTableName,
    Item: {
      'AttendeeId': {
        S: `${title}/${attendeeId}`
      },
      'Name': { S: name },
      'TTL': {
        N: '' + oneDayFromNow
      }
    }
  }).promise();
}

function getNotificationsConfig() {
  //if (provideQueueArn) {
  //  return  {
  //    SqsQueueArn: sqsQueueArn,
  //  };
  //}
  return {}
}

// ===== Join or create meeting ===================================
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

app.post('/meeting', wrap(async function(req, res) {
  res.set({'isBase64Encoded': false});

  const event = req.apiGateway.event;
  if (!event.queryStringParameters.title) {
    res.status(400);
    res.send('Must provide title')
  }
  const title = event.queryStringParameters.title;
  const region = event.queryStringParameters.region || 'us-east-1';
  let meetingInfo = await getMeeting(title);
  if (!meetingInfo) {
    const request = {
      ClientRequestToken: uuid(),
      MediaRegion: region,
      NotificationsConfiguration: getNotificationsConfig(),
    };
    console.info('Creating new meeting: ' + JSON.stringify(request));
    meetingInfo = await chime.createMeeting(request).promise();
    await putMeeting(title, meetingInfo);
  }

  const joinInfo = {
    JoinInfo: {
      Title: title,
      Meeting: meetingInfo.Meeting,
    },
  };

  res.status(200);
  res.json(joinInfo)
}));

app.post('/join', wrap(async function(req, res) {
  res.set({'isBase64Encoded': false});

  const event = req.apiGateway.event;
  if (!event.queryStringParameters.title || !event.queryStringParameters.name) {
    res.status(400);
    res.send('Must provide title and name')
  }
  const title = event.queryStringParameters.title;
  const name = event.queryStringParameters.name;
  const region = event.queryStringParameters.region || 'us-east-1';
  let meetingInfo = await getMeeting(title);
  if (!meetingInfo) {
    const request = {
      ClientRequestToken: uuid(),
      MediaRegion: region,
      NotificationsConfiguration: getNotificationsConfig(),
    };
    console.info('Creating new meeting: ' + JSON.stringify(request));
    meetingInfo = await chime.createMeeting(request).promise();
    await putMeeting(title, meetingInfo);
  }

  console.info('Adding new attendee');
  const attendeeInfo = (await chime.createAttendee({
      MeetingId: meetingInfo.Meeting.MeetingId,
      ExternalUserId: uuid(),
    }).promise());

  putAttendee(title, attendeeInfo.Attendee.AttendeeId, name);

  const joinInfo = {
    JoinInfo: {
      Title: title,
      Meeting: meetingInfo.Meeting,
      Attendee: attendeeInfo.Attendee
    },
  };

  res.status(200);
  res.json(joinInfo)
}));

app.get('/attendee', wrap(async function(req, res) {
  res.set({'isBase64Encoded': false});

  const event = req.apiGateway.event;
  const title = event.queryStringParameters.title;
  const attendeeId = event.queryStringParameters.attendee;
  const attendeeInfo = {
    AttendeeInfo: {
      AttendeeId: attendeeId,
      Name: await getAttendee(title, attendeeId),
    },
  };

  res.status(200);
  res.json(attendeeInfo)
}));

app.post('/end', wrap(async function(req, res) {
  res.set({'isBase64Encoded': false});

  const event = req.apiGateway.event;
  const title = event.queryStringParameters.title;
  let meetingInfo = await getMeeting(title);
  await chime.deleteMeeting({
    MeetingId: meetingInfo.Meeting.MeetingId,
  }).promise();
  res.status(200);
  res.json({})
}));

app.listen(3000, function() {
    console.log("App started")
});

// Export the app object. When executing the application local this does nothing. However,
// to port it to AWS Lambda we will create a wrapper around that will load the app from
// this file
module.exports = app
