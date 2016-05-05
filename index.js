// load the mysql library and express
var mysql = require('mysql');
var express = require('express');
var app = express();
var moment = require('moment');
var bodyParser = require('body-parser');
// var bcrypt = require('bcrypt');
// var secureRandom = require('secure-random');
var cookieParser = require('cookie-parser');
var reddit = require('./reddit.js');

var connection = mysql.createConnection({
    host: 'localhost',
    user: 'paucortes',
    password: '',
    database: 'reddit'
});
var redditAPI = reddit(connection);

app.use(cookieParser());
app.use(bodyParser());
app.use(redditAPI.checkLoginToken);

app.get('/', function(request, response){
    redditAPI.getHomePage(request.query.sort, function(err, result) {
    var arr = result.map(function(post) {
        return `<li><h2>
            <a href="${post.postUrl}">${post.postTitle}</a>
            ${' created '}
            ${moment(post.postCreationDate).fromNow()}
                </h2></li><h3>
                ${'The post was created by user: '}
                ${post.postCreatedByUsername}
            </h3>
            <form action="/vote" method="post"><input type="hidden" name="vote" value="1"><input type="hidden" name="postId" value=${post.postId}><button type="submit">Upvote post</button> </form><form action="/vote" method="post"><input type="hidden" name="vote" value="-1"><input type="hidden" name="postId" value=${post.postId}><button type="submit">Downvote post</button>
            </form>`;
    });
    response.send(`<div id="contents">
        <h1>List of contents</h1>
        <ul>${arr.join(' ')}</ul>
        </div>`);
    });
});

app.post('/vote', function(request, response){
    var votedPost = request.body.postId;
    var voteValue = request.body.vote;
    var userVote = request.loggedInUser[0].userId;
    redditAPI.createOrUpdateVote({userId: userVote, postId : votedPost, vote: voteValue}, function(err, result){
        if (err) {
            response.send('There was an error with your vote, please try again');
        }
        else {
            response.redirect('back');
        }
    });
});

app.get('/createContent', function(request, response){
    response.sendFile('createPost.html', { root: __dirname + '/'}, function (err) {
        if (err) {
            response.status(400).end();
        }
    });
});

app.post('/createContent', function(request, response){
    redditAPI.createPost(request.body, function(err, postCreated){
        response.redirect(`/posts/${postCreated.id}`); 
    });
});

app.get('/posts/:ID', function(request, response){
    redditAPI.getSinglePost(request.params.ID, function(err, result){
        response.send(`<h3><li><a href="${result.postUrl}">${result.postTitle}</a></li>
        <li>Created on: ${result.postCreated}</li>
        <li>Last updated on: ${result.postUpdated}</li>
        <li>Created by: ${result.username}</li>
        </h3`);
    });
});

app.get('/signUp', function(request, response){
    response.sendFile('createUser.html', { root: __dirname + '/'}, function (err){
        if (err) {
            response.status(400).end();
        }
    });
});

app.post('/signUp', function(request, response){
    redditAPI.createUser(request.body, function(err, userCreated){
        response.redirect('/login'); 
    });
});

app.get('/login', function(request, response){
    if(request.query.error === 'loginFailed'){
        response.sendFile('loginFailed.html', { root: __dirname + '/'}, function (err){
            if (err) {
             response.status(400).end();
            }
        });
    }
    else {
        response.sendFile('login.html', { root: __dirname + '/'}, function (err){
            if (err) {
             response.status(400).end();
            }
        });
    }
});

app.post('/login', function(request, response) {
    if (request.loggedInUser){
        response.redirect('/?sort=new');
        }
    else {
        var user = request.body.username;
        var pass = request.body.password;
        redditAPI.checkLogin(user, pass, function(err, res) {
            if (err === 'username or password incorrect') {
                response.redirect('/login?error=loginFailed');
                }
            else {
                redditAPI.createSession(res.id, function(err, token) {
                    if (err) {
                        response.status(500).send('an error occurred. please try again later!');
                    }
                    else {
                        response.cookie('SESSION', token);
                        response.redirect('/?sort=new');
                    }
                });
            }
        });
    }
});

var server = app.listen(process.env.PORT, process.env.IP, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Listening at http://%s:%s', host, port);
});