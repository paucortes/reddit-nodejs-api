// load the mysql library and express
var mysql = require('mysql');
var express = require('express');
var app = express();
var moment = require('moment');
var bodyParser = require('body-parser');

// create a connection to our Cloud9 server
var connection = mysql.createConnection({
    host: 'localhost',
    user: 'paucortes',
    password: '',
    database: 'reddit'
});

// load our API and pass it the connection
var reddit = require('./reddit');
var redditAPI = reddit(connection);

function getHomePage(sortingMethod, callback) {
    if (!sortingMethod || sortingMethod === "new") {
        connection.query('SELECT p.id AS postId, p.title AS postTitle, p.url AS postUrl, p.userId AS postCreatedByUserId, users.username AS postCreatedByUsername, p.createdAt AS postCreationDate FROM posts AS p JOIN users ON users.id=p.userId ORDER BY postCreationDate DESC LIMIT 25', function(error, result) {
        if (error) {
            callback(error);
        }
        else {
            callback(null, result);
        }
        });
    }
    else if (sortingMethod === "top") {
        connection.query(`SELECT p.id AS postId, p.title AS postTitle, p.url AS postUrl, p.userId AS postCreatedByUserId, users.username AS postCreatedByUsername, p.createdAt AS postCreationDate, SUM(v.vote) as voteScore FROM posts AS p JOIN users ON users.id=p.userId JOIN votes AS v ON p.id = v.postId GROUP BY p.id ORDER BY voteScore DESC`, function(error, result) {
        if (error) {
            callback(error);
        }
        else {
            callback(null, result);
        }
        });
    }
    else if (sortingMethod === "hot") {
        connection.query(`SELECT p.id AS postId, p.title AS postTitle, p.url AS postUrl, p.userId AS postCreatedByUserId, users.username AS postCreatedByUsername, p.createdAt AS postCreationDate, SUM(v.vote)/TIMEDIFF(NOW(), p.createdAt) as hotnessRanking FROM posts AS p JOIN users ON users.id=p.userId JOIN votes AS v ON p.id = v.postId GROUP BY p.id ORDER BY hotnessRanking DESC`, function(error, result) {
        if (error) {
            callback(error);
        }
        else {
            callback(null, result);
        }
        });
    }
}

app.get('/', function(request, response){
        getHomePage(request.query.sort, function(err, result) {
        var arr = result.map(function(post) {
            return `<li><h2>
                <a href="${post.postUrl}">${post.postTitle}</a>
                ${' created '}
                ${moment(post.postCreationDate).fromNow()}
                    </h2></li><h3>
                    ${'The post was created by user: '}
                    ${post.postCreatedByUsername}
                </h3>`;
        });
        response.send(`<div id="contents">
            <h1>List of contents</h1>
            <ul>${arr.join(' ')}</ul>
            </div>`);
    });
});

app.get('/createContent', function(request, response){
    response.sendFile('form.html', { root: __dirname + '/'}, function (err) {
        if (err) {
            response.status(400).end();
        }
        else {
            var parser = bodyParser.urlencoded();
            app.post('/createContent', parser, function(request, response){
                redditAPI.createPost(request.body, function(err, postCreated){
                   response.send(`<h3>Your post was created successfully!!</h2>
                   <h3><li><a href="${postCreated.url}">${postCreated.title}</a></li>
                   </h3>
                   `); 
                });
            });
        }
  });
});



var server = app.listen(process.env.PORT, process.env.IP, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Listening at http://%s:%s', host, port);
});