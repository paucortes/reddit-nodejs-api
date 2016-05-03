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

}
}
                
                    