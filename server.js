var AWS = require('aws-sdk');
const express = require('express');
var path = require('path');
const app = express();
const port = 3000;

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


var sts = new AWS.STS();
var s3;

//***************Assuming the IAM S3AccessRole**************
const params = {
    RoleArn: 'arn:aws:iam::968506304545:role/S3AccessRole',
    RoleSessionName: 'roleSession1'
};
async function assumeIAMRole() {
    try {
        const assumedRole = await sts.assumeRole(params).promise();
        const accessParams = {
            accessKeyId: assumedRole.Credentials.AccessKeyId,
            secretAccessKey: assumedRole.Credentials.SecretAccessKey,
            sessionToken: assumedRole.Credentials.SessionToken
        };
        const innerS3 = await new AWS.S3(accessParams);
        //const sts2 = new AWS.STS(accessParams);
        s3 = innerS3;
        console.log('S3AccessRole assumed');
    }
    catch (err){
        console.log('Cannot assume role');
        console.log(err);
    }
}
assumeIAMRole();

app.get('/Music/:artist/:album/:song', function(req, res) {
    var key = req.path.replace(/%20/g, " ").slice(1);

    var params = {Bucket: 'aws-testbucket16', Key: key, Expires: 120};
    var url = s3.getSignedUrl('getObject', params);
    console.log("Serving Song: " + req.params.song);
    res.send(url);
});

app.get('/', function(req, res){
    var musicList = null;

    getMusicList()
    .then(function(value) {
        //console.log(value);
        res.send(value);
        console.log('musicList sent');
    })
    .catch(function(err){
        console.log("Error: " + err);
    });
    
});

app.post('/', function (req, res) {
    res.send('Got a POST request')
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`))


function getMusicList() {
    var params = {
        Bucket: "aws-testbucket16",
        Prefix: "Music/"
    }

    var promise1 = new Promise(function (resolve, reject) {
        s3.listObjects(params, function(err, data) {
            if (err) {
                console.log(err, err.stack); // an error occurred
                reject();
            }
            else { // successful response
                console.log(typeof data.Contents);
                //console.log(data);
                
                resolve(formatList(data.Contents));
            }     
        });
    });
    
    return promise1;
}

function formatList(musicList) {
    console.log("Printing List:")
    //console.log(musicList);
    const songs = Object.entries(musicList);
    //console.log(songs);
    var albums = {};
    var artistNames = [];
    var artists = {};

    for (const song of songs) {
        //console.log("Song: ");
        //console.log(song[1].Key);
        var key = song[1].Key;
        var seg = key.split('/');
        var artist = seg[1];
        var album = seg[2];

        var data = {
            title: path.basename(key),
            path: key
        };

        if(artist in artists) {
            if(artists[artist].albumNames.includes(album)) {
                artists[artist].albums[album].push(data);
            }
            else{
                artists[artist].albums[album] = [ data ];
                artists[artist].albumNames.push(album);
            }
        }
        else {
            artists[artist] = {
                albumNames: [ album ],
                albums: { }
            }
            artists[artist].albums[album] = [ data ];
        }
        //console.log(data);
    }
    console.log(artists);
    return artists;
}