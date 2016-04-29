var bcrypt = require('bcrypt');
var HASH_ROUNDS = 10;

module.exports = function RedditAPI(conn) {
  return {
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
    createPost: function(post, subredditId, callback) {
      conn.query(
        'INSERT INTO `posts` (`userId`, `title`, `url`, `createdAt`, `subredditId`) VALUES (?, ?, ?, ?, ?)', [post.userId, post.title, post.url, null, subredditId],
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
              'SELECT `id`,`title`,`url`,`userId`, `createdAt`, `updatedAt`, `subredditId` FROM `posts` WHERE `id` = ?', [result.insertId],
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
            var mapped = results.map(function(curr){
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
            Post inserted successfully. Let's use the result.insertId to retrieve
            the post and send it to the caller!
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
              var mapped = result.map(function(curr){
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
        'INSERT INTO `comments` (`text`, `userId`, `postId`, `parentId`, `createdAt`) VALUES (?, ?, ?, ?, ?)', [comment.text, comment.userId, comment.postId, parentId?parent: null, null],
        function(err, result) {
          if (err) {
            callback(err);
          }
          else {
            /*
            Comment inserted successfully. Let's use the result.insertId to retrieve
            the post and send it to the caller!
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
    }
  };
};
