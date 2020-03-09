/* Amplify Params - DO NOT EDIT
You can access the following resource attributes as environment variables from your Lambda function
var environment = process.env.ENV
var region = process.env.REGION
var storageMeetingsName = process.env.STORAGE_MEETINGS_NAME
var storageMeetingsArn = process.env.STORAGE_MEETINGS_ARN

Amplify Params - DO NOT EDIT */var AWS = require('aws-sdk');
var ddb = new AWS.DynamoDB();
const chime = new AWS.Chime({ region: 'us-east-1' });
chime.endpoint = new AWS.Endpoint('https://service.chime.aws.amazon.com/console');

const oneDayFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

// Read resource names from the environment
const meetingsTableName = process.env.STORAGE_MEETINGS_NAME;

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

// ===== Join or create meeting ===================================
exports.handler = async(event, context, callback) => {
  var response = {
    "statusCode": 200,
    "headers": {},
    "body": '',
    "isBase64Encoded": false
  };
  const title = event.queryStringParameters.title;
  let meetingInfo = await getMeeting(title);
  await chime.deleteMeeting({
    MeetingId: meetingInfo.Meeting.MeetingId,
  }).promise();
  callback(null, response);
};