var bcrypt = require('bcrypt');
var secureRandom = require('secure-random');
var HASH_ROUNDS = 10;

module.exports = function RedditAPI(conn) {
    var allFunctions = {
      createUser: function(user, callback) {
        // first we have to hash the password...
        bcrypt.hash(user.password, HASH_ROUNDS, function(err, hashedPassword) {
          if (err) {
            callback(err);
          }
          else {
            conn.query(
              'INSERT INTO `users` (`username`,`password`, `createdAt`) VALUES (?, ?, ?)', [user.username, hashedPassword, null],
              function(err, result) {
                if (err) {
                  /*
                  There can be many reasons why a MySQL query could fail. While many of
                  them are unknown, there's a particular error about unique usernames
                  which we can be more explicit about!
                  */
                  if (err.code === 'ER_DUP_ENTRY') {
                    callback(new Error('A user with this username already exists'));
                  }
                  else {
                    callback(err);
                  }
                }
                else {
                  /*
                  Here we are INSERTing data, so the only useful thing we get back
                  is the ID of the newly inserted row. Let's use it to find the user
                  and return it
                  */
                  conn.query(
                    'SELECT `id`, `username`, `createdAt`, `updatedAt` FROM `users` WHERE `id` = ?', [result.insertId],
                    function(err, result) {
                      if (err) {
                        callback(err);
                      }
                      else {
                        /*
                        Finally! Here's what we did so far:
                        1. Hash the user's password
                        2. Insert the user in the DB
                        3a. If the insert fails, report the error to the caller
                        3b. If the insert succeeds, re-fetch the user from the DB
                        4. If the re-fetch succeeds, return the object to the caller
                        */
                        callback(null, result[0]);
                      }
                    }
                  );
                }
              }
            );
          }
        });
      },
      createPost: function(post, callback) {
        conn.query(
          'INSERT INTO `posts` (`userId`, `title`, `url`, `createdAt`) VALUES (?, ?, ?, ?)', [1, post.title, post.url, null],
          function(err, result) {
            if (err) {
              callback(err);
            }
            else {
              /*
              Post inserted successfully. Let's use the result.insertId to retrieve
              the post and send it to the caller!
              */
              conn.query(
                'SELECT `id`,`title`,`url`,`userId`, `createdAt`, `updatedAt` FROM `posts` WHERE `id` = ?', [result.insertId],
                function(err, result) {
                  if (err) {
                    callback(err);
                  }
                  else {
                    callback(null, result[0]);
                  }
                }
              );
            }
          }
        );
      },
      getAllPosts: function(options, callback) {
        // In case we are called without an options parameter, shift all the parameters manually
        if (!callback) {
          callback = options;
          options = {};
        }
        var limit = options.numPerPage || 25; // if options.numPerPage is "falsy" then use 25
        var offset = (options.page || 0) * limit;

        conn.query(`
        SELECT posts.id, posts.title, posts.url, posts.userId, posts.createdAt, posts.updatedAt, posts.subredditId, users.id AS usersId, users.username, users.createdAt AS usersCreate, users.updatedAt AS usersUpd, subreddits.id AS subId, subreddits.name AS subName, subreddits.description AS subDesc, subreddits.createdAt as subCreatedAt FROM posts JOIN users ON users.id = posts.userId RIGHT JOIN subreddits ON posts.subredditId = subreddits.id ORDER BY posts.createdAt
        LIMIT ? OFFSET ?
        `, [limit, offset],
          function(err, results) {
            if (err) {
              callback(err);
            }
            else {
              var mapped = results.map(function(curr) {
                return {
                  id: curr.id,
                  title: curr.title,
                  url: curr.url,
                  createdAt: curr.createdAt,
                  updatedAt: curr.updatedAt,
                  user: {
                    userId: curr.usersId,
                    username: curr.username,
                    createdAt: curr.usersCreate,
                    updatedAt: curr.usersUpd
                  },
                  subredit: !curr.subId ? "No subreddit" : {
                    subredditId: curr.subId,
                    subredditName: curr.subName,
                    subredditDesc: curr.subDesc,
                    subredditCreatedAt: curr.subCreatedAt
                  }
                };
              });

              callback(null, mapped);
            }
          }
        );
      },
      getAllPostsForUser: function(usuario, options, callback) {
        // In case we are called without an options parameter, shift all the parameters manually
        if (!callback) {
          callback = options;
          options = {};
        }
        var limit = options.numPerPage || 25; // if options.numPerPage is "falsy" then use 25
        var offset = (options.page || 0) * limit;

        conn.query(`
            SELECT posts.id, posts.title, posts.url, posts.userId, posts.createdAt, posts.updatedAt, users.id as userId, users.username, users.createdAt as userCreated, users.updatedAt as userUpdated FROM posts join users on users.id = posts.userId WHERE users.Id=${usuario}
            LIMIT ? OFFSET ?
            `, [limit, offset],
          function(err, results) {
            if (err) {
              callback(err);
            }
            else {
              var res = {
                userId: results[0].userId,
                username: results[0].username,
                createdAt: results[0].userCreated,
                updatedAt: results[0].userUpdated,
                posts: results.map(function(curr) {
                  return {
                    postid: curr.id,
                    postTitle: curr.title,
                    postUrl: curr.url,
                    createdAt: curr.createdAt,
                    updatedAt: curr.updatedAt,
                  };
                })
              };
              callback(null, res);
            }
          });
      },
      getSinglePost: function(postId, callback) {
        conn.query(`
            SELECT posts.id, posts.title, posts.url, posts.userId, posts.createdAt, posts.updatedAt, users.id as userId, users.username FROM posts join users on users.id = posts.userId WHERE posts.id=${postId}`,
          function(err, results) {
            if (err) {
              callback(err);
            }
            else {
              callback(null, {
                postId: results[0].id,
                postTitle: results[0].title,
                postUrl: results[0].url,
                postCreated: results[0].createdAt,
                postUpdated: results[0].updatedAt,
                userId: results[0].userId,
                username: results[0].username
              });
            }
          }
        );
      },
      createSubreddit: function(sub, callback) {
        conn.query(
          'INSERT INTO subreddits (name, description) VALUES (?, ?)', [sub.name, sub.description],
          function(err, result) {
            if (err) {
              callback(err);
            }
            else {
              /*
              Subreddit inserted successfully. Let's use the result.insertId to retrieve
              the subreddit and send it to the caller!
              */
              conn.query(
                'SELECT id, name, description, createdAt FROM subreddits WHERE id = ?', [result.insertId],
                function(err, result) {
                  if (err) {
                    callback(err);
                  }
                  else {
                    callback(null, result[0]);
                  }
                }
              );
            }
          }
        );
      },
    getAllSubreddits: function(options, callback) {
        if (!callback) {
          callback = options;
          options = {};
        }
        var limit = options.numPerPage || 25; // if options.numPerPage is "falsy" then use 25
        var offset = (options.page || 0) * limit;
        conn.query(
          'SELECT id, name, description, createdAt FROM subreddits ORDER BY createdAt LIMIT ? OFFSET ?', [limit, offset],
          function(err, result) {
            if (err) {
              callback(err);
            }
            else {
              var mapped = result.map(function(curr) {
                return {
                  subId: curr.id,
                  subName: curr.name,
                  subDesc: curr.description,
                  subCreatedAt: curr.createdAt
                };
              });
              callback(null, mapped);
            }
          });
      },
    createComment: function(comment, callback) {
        var parentId = comment.parentId;
        conn.query(
          'INSERT INTO `comments` (`text`, `userId`, `postId`, `parentId`, `createdAt`) VALUES (?, ?, ?, ?, ?)', [comment.text, comment.userId, comment.postId, parentId ? parent : null, null],
          function(err, result) {
            if (err) {
              callback(err);
            }
            else {
              /*
              Comment inserted successfully. Let's use the result.insertId to retrieve
              the comment and send it to the caller!
              */
              conn.query(
                'SELECT `text`,`userId`,`postId`,`parentId`, `createdAt` FROM `comments` WHERE `id` = ?', [result.insertId],
                function(err, result) {
                  if (err) {
                    callback(err);
                  }
                  else {
                    callback(null, result[0]);
                  }
                }
              );
            }
          }
        );
      },
    createOrUpdateVote: function(vote, callback){
        var id = parseInt(vote.postId);
        var user = vote.userId;
        var voteResult = parseInt(vote.vote);
        if (!id || !user || !voteResult) {
            callback('postId, userId or vote fields are missing');
        }
        else if (voteResult < -1 || voteResult > 1){
            callback('The vote must have a value of 1, 0 or -1');
        }
        else {
            conn.query(`INSERT INTO votes (postId, userId, vote) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE vote=${voteResult}` ,[id, user, voteResult], function(err, result) {
            if (err) {
                console.log(err);
                callback(err);
            }
            else {
                callback(null, "vote completed");
                  }
            });
        }
    },
    getHomePage: function(sortingMethod, callback) {
        if (!sortingMethod || sortingMethod === "new") {
            conn.query('SELECT p.id AS postId, p.title AS postTitle, p.url AS postUrl, p.userId AS postCreatedByUserId, users.username AS postCreatedByUsername, p.createdAt AS postCreationDate FROM posts AS p JOIN users ON users.id=p.userId ORDER BY postCreationDate DESC LIMIT 25', function(error, result) {
                if (error) {
                    callback(error);
                }
                else {
                    callback(null, result);
                }
            });
        }
        else if (sortingMethod === "top") {
            conn.query(`SELECT p.id AS postId, p.title AS postTitle, p.url AS postUrl, p.userId AS postCreatedByUserId, users.username AS postCreatedByUsername, p.createdAt AS postCreationDate, SUM(v.vote) as voteScore FROM posts AS p JOIN users ON users.id=p.userId JOIN votes AS v ON p.id = v.postId GROUP BY p.id ORDER BY voteScore DESC`, function(error, result) {
                if (error) {
                    callback(error);
                }
                else {
                    callback(null, result);
                }
            });
        }
        else if (sortingMethod === "hot") {
            conn.query(`SELECT p.id AS postId, p.title AS postTitle, p.url AS postUrl, p.userId AS postCreatedByUserId, users.username AS postCreatedByUsername, p.createdAt AS postCreationDate, SUM(v.vote)/TIMEDIFF(NOW(), p.createdAt) as hotnessRanking FROM posts AS p JOIN users ON users.id=p.userId JOIN votes AS v ON p.id = v.postId GROUP BY p.id ORDER BY hotnessRanking DESC`, function(error, result) {
                if (error) {
                    callback(error);
                }
                else {
                    callback(null, result);
                }
            });
        }
        else if (sortingMethod === "controversial") {
            conn.query(`SELECT p.id AS postId, p.title AS postTitle, p.url AS postUrl, p.userId AS postCreatedByUserId, users.username AS postCreatedByUsername, p.createdAt AS postCreationDate, if(SUM(case when v.vote=1 then 1 else 0 end) < SUM(case when v.vote=-1 then 1 else 0 end), count(v.vote) * (SUM(case when v.vote=1 then 1 else 0 end) / SUM(case when v.vote=-1 then 1 else 0 end)), count(v.vote) * (SUM(case when v.vote=-1 then 1 else 0 end) / SUM(case when v.vote=1 then 1 else 0 end))) as controversial FROM posts AS p JOIN users ON users.id=p.userId JOIN votes AS v ON p.id = v.postId GROUP BY p.id sort by controversial desc`, function(error, result) {
                if (error) {
                    callback(error);
                }
                else {
                    callback(null, result);
                }
            });
        }
    },
    checkLogin: function(username, password, callback) {
        conn.query('SELECT * FROM users WHERE username = ?', [username],function(error, result) {
        if(!result) {
            callback('username or password incorrect');
        }
        else {
            var user = result[0];
            var actualHashedPassword = result[0].password;
            bcrypt.compare(password, actualHashedPassword, function(err, result) {
                if (result === true) {
                    callback(null, user);
                }
                else {
                    callback('username or password incorrect');
                }
            });
    }
    });
    },
    createSessionToken: function() {
        return secureRandom.randomArray(100).map(code => code.toString(36)).join('');
    },
    createSession: function(userId, callback) {
        var token = allFunctions.createSessionToken();
        conn.query('INSERT INTO sessions SET userId = ?, token = ?', [userId, token], function(err, result) {
            if (err) {
                callback(err);
            }
            else {
                callback(null, token);
            }
        });
    },
    getUserFromSession: function(token, callback) {
        var tokenToCheck = token;
        conn.query('SELECT sessions.userId, sessions.token FROM sessions WHERE sessions.token = ?', [tokenToCheck], function(err, result) {
            callback(null, result);
        });
    },
    checkLoginToken: function(request, response, next) {
        // check if there's a SESSION cookie...
        if (request.cookies.SESSION) {
            allFunctions.getUserFromSession(request.cookies.SESSION, function(err, user) {
                // if we get back a user object, set it on the request. From now on, this request looks like it was made by this user as far as the rest of the code is concerned
                if (user) {
                    request.loggedInUser = user;
                }
                next();
            });
        }
        else {
            // if no SESSION cookie, move forward
            next();
        }
    }
    }
    return allFunctions;
}
        

      
    //   getCommentsForPost: function(postId, callback) {
    //     conn.query(`
    //             SELECT comments.text, comments.id, comments.postId, comments.createdAt, comments.updatedAt, c1.text AS c1Text, c1.id as c1Id, c1.postId as c1PostsId, c1.createdAt as c1CreatedAt, c1.updatedAt as c1UpdatedAt, c1.parentId as c1ParentId, c2.id as c2Id, c2.postId as c2PostsId, c2.createdAt as c2CreatedAt, c2.updatedAt as c2UpdatedAt, c2.parentId as c2ParentId FROM comments LEFT JOIN comments AS c1 ON comments.id = c1.parentId LEFT JOIN comments AS c2 ON c1.id = c2.parentId WHERE comments.parentId IS null ORDER BY comments.createdAt, c1.createdAt, c2.createdAt`,
    //             // LIMIT ? OFFSET ?
    //             // `, [limit, offset],
    //       function(err, results) {
            
    //         if (err) {
    //           callback(err);
    //         } else {
    //           // console.log(results)
    //           var final = [];
    //           results.forEach(function(element) {
    //               // if i have an index value
    //               var checkId = results.findIndex(function(item){
    //                 console.log(element.id + ' === ' + item.id);
    //                 return element.id === item.id
    //               });
                  
    //               console.log(checkId + " hello in checkId");
                  
    //               if (checkId != -1) {
                    
    //                 // I would check if it has a reply c1.id
    //                 var checkId2 = final.findIndex(function(item){
    //                   return item.c1ParentId === element.id
                      
    //                 });
                    
    //                 if (checkId2 != -1) {
                    
    //                 console.log(checkId2 + " hello in checkId2");
                    
    //                 // if c1 parent id = comment id
    //                 if (element.c1ParentId === element.id) {
    //                   // push c1 into the replies property of the object associated with comment.id
    //                   final[checkId2].replies.push({
    //                     commentId: element.c1Id, commentText: element.c1Text, commentCreatedAt: element.c1CreatedAt, commentUpdatedAt: element.c1UpdatedAt, replies: []
    //                   })
    //                   // if c2.parent id = c1.id
    //                   var checkId3 = final.findIndex(function(item){
    //                     return item.c2ParentId === element.id
    //                   });
    //                   if (checkId3 != -1) {
    //                     // push c2 into the replies property of the object associated with c1.id
    //                     final[checkId].replies.push({
    //                       commentId: element.c2Id, commentText: element.c2Text, commentCreatedAt: element.c2CreatedAt, commentUpdatedAt: element.c2UpdatedAt});
    //                   }
    //                 }
    //               } else {
    //                 final.push({commentId: element.id, commentText: element.text, commentCreatedAt: element.createdAt, commentUpdatedAt: element.updatedAt, replies: []});
    //               }
             
    //         }
    //       });
    //     console.log("yes!");
    //     console.log(final);
    //     return final;
    //   }
    // })



                
                    