const AWS = require('aws-sdk');
const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


let sts = new AWS.STS();
let s3;
let docClient;
let playCount = 0;

AWS.config.update({
    region: "us-east-1"
});

//***************Assuming the IAM S3AccessRole**************
const params = {
    RoleArn: 'arn:aws:iam::968506304545:role/S3AccessRole',
    RoleSessionName: 'roleSession1',
    DurationSeconds: 43200
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
        const innerDoc = await new AWS.DynamoDB.DocumentClient(params);
        //const sts2 = new AWS.STS(accessParams);
        s3 = innerS3;
        docClient = innerDoc;
        console.log('S3AccessRole assumed');
    }
    catch (err){
        console.log('Cannot assume role');
        console.log(err);
    }
}
assumeIAMRole();

setInterval(function(){
    playCount = 0;
}, 60000);
setInterval(assumeIAMRole, 43100000);

//Respond to GET Request to list  genres
app.get('/genres', function(req, res) {
    var params = {
        TableName: 'genres'
    };
    docClient.scan(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(404).end();
        }
        else {
            var genres = [];
            for (let item of data.Items) {
                genres.push(item.genre);
            }
            res.send(genres);
        }
    });
});

//Respond to GET request to list all artists in a genre
app.get('/artists/for/genre', function(req, res) {
    var params = {
        TableName: 'artists',
        KeyConditionExpression: 'genre = :hkey',
        ExpressionAttributeValues: {
          ':hkey': req.query.genre
        }
      };
    docClient.query(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(404).end();
        }
        else {
            var artists = [];
            for (let item of data.Items) {
                artists.push(item.artist);
            }
            res.send(artists);
        }
    });
});

//Respond to GET request to list all albums by an artist
app.get('/albums/for/artist', function(req, res) {
    var params = {
        TableName: 'albums',
        KeyConditionExpression: 'artist = :hkey',
        ExpressionAttributeValues: {
          ':hkey': req.query.artist
        }
      };
    docClient.query(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(404).end();
        }
        else {
            var albums = [];
            for (let item of data.Items) {
                albums.push(item.album);
            }
            res.send(albums);
        }
    });
});

//Respond to GET request to list all songs in an album
app.get('/songs/for/album', function(req, res) {
    var params = {
        TableName: 'songs',
        KeyConditionExpression: 'album = :hkey',
        ExpressionAttributeValues: {
          ':hkey': req.query.album
        }
    };
    docClient.query(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(404).end();
        }
        else {
            var songs = [];
            for (let item of data.Items) {
                songs.push(item.song);
            }
            res.send(songs);
        }
    });
});

//Respond to GET request for url of a specific song (slower because of scan)
app.get('/song', function(req, res) {
    var songName = path.basename(req.query.song, '.mp3');
    var params = {
        TableName: 'songs',
        FilterExpression: 'song = :value',
        ExpressionAttributeValues: {
            ':value': songName
        }
    };
    if (playCount < 30) {
        docClient.scan(params, function(err, data) {
            if (err) {
                console.log(err);
                res.status(404).end();
            }
            else {
                var key = data.Items[0].path;
                var params1 = {Bucket: 'aws-testbucket16', Key: key, Expires: 120};
                var url = s3.getSignedUrl('getObject', params1);
                console.log("Sending Song: " + songName);
                playCount += 1;
                res.send(url);
            }
        });
    }
    else {
        console.log("Playback limit exceeded. Count: " + playCount);
        res.send("Error: Too many playback requests per minute");
    }   
});

//Respond to GET request for url of a song in an album (quicker due to query)
app.get('/song/in/album', function(req, res) {
    var songName = path.basename(req.query.song, '.mp3');
    var params = {
        TableName: 'songs',
        KeyConditionExpression: 'album = :hkey and song = :rkey',
        ExpressionAttributeValues: {
          ':hkey': req.query.album,
          ':rkey': songName
        }
    };
    if (playCount < 30) {
        docClient.query(params, function(err, data) {
            if (err) {
                console.log(err);
                res.send("Error: " + err);
            }
            else {
                var key = data.Items[0].path;
                var params1 = {Bucket: 'aws-testbucket16', Key: key, Expires: 120};
                var url = s3.getSignedUrl('getObject', params1);
                console.log("Serving Song: " + songName);
                playCount += 1;
                res.send(url);
            }
        });
    }
    else {
        console.log("Playback limit exceeded. Count: " + playCount);
        res.send("Error: Too many playback requests per minute");
    }    
});


app.get('/Music/:artist/:album/:song', function(req, res) {
    if (playCount < 30) {
        var key = req.path.replace(/%20/g, " ").slice(1);
        var params = {Bucket: 'aws-testbucket16', Key: key, Expires: 180};
        var url = s3.getSignedUrl('getObject', params);
        console.log("Serving Song: " + req.params.song);
        playCount += 1;
        res.send(url);
    }
    else {
        console.log("Playback limit exceeded. Count: " + playCount);
        res.send("Error: Too many playback requests per minute");
    }
});


app.get('/', function(req, res){
    var musicList = null;

    getMusicList()
    .then(function(value) {
        //console.log(value);
        res.send(value);
    })
    .catch(function(err){
        console.log("Error: " + err);
    });
    
});



app.listen(port, () => console.log(`Server listening on port ${port}`))



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
                resolve(formatList(data.Contents));
            }     
        });
    });
    
    return promise1;
}

function formatList(musicList) {
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
    return artists;
}