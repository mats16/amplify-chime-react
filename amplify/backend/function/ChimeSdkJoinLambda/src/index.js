/* Amplify Params - DO NOT EDIT
You can access the following resource attributes as environment variables from your Lambda function
var environment = process.env.ENV
var region = process.env.REGION
var storageMeetingsName = process.env.STORAGE_MEETINGS_NAME
var storageMeetingsArn = process.env.STORAGE_MEETINGS_ARN
var storageAttendeesName = process.env.STORAGE_ATTENDEES_NAME
var storageAttendeesArn = process.env.STORAGE_ATTENDEES_ARN

Amplify Params - DO NOT EDIT */var AWS = require('aws-sdk');
var ddb = new AWS.DynamoDB();
const chime = new AWS.Chime({ region: 'us-east-1' });
chime.endpoint = new AWS.Endpoint('https://service.chime.aws.amazon.com/console');

const oneDayFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

// Read resource names from the environment
const meetingsTableName = process.env.STORAGE_MEETINGS_NAME;
const attendeesTableName = process.env.STORAGE_ATTENDEES_NAME;

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
      'Data': { S: JSON.stringify(meetingInfo) },
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
  return {}
}

// ===== Join or create meeting ===================================
exports.handler = async(event, context, callback) => {
  var response = {
    "statusCode": 200,
    "headers": {},
    "body": '',
    "isBase64Encoded": false
  };

  if (!event.queryStringParameters.title || !event.queryStringParameters.name) {
    response["statusCode"] = 400;
    response["body"] = "Must provide title and name";
    callback(null, response);
    return;
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

  response.body = JSON.stringify(joinInfo, '', 2);
  callback(null, response);
};