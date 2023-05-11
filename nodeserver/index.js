const io = require('socket.io')(8000, {
    cors: {
        origin: "*"
    }
});
//cros youtube se add kiya bcz of cros error

//node server to handle socket io cinnectons

//pehle nodemon run karne se pehle cd nodeserver kar bhai
const users = {};


io.on("connection", (socket) => {
    socket.on('new-user-joined', kname => {
        console.log("new user", kname)

        users[socket.id] = kname;
        socket.broadcast.emit('user-joined', kname);
    });

    socket.on('send', message => {
        socket.broadcast.emit('receive', { message: message, kname: users[socket.id] });
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('left', users[socket.id]);
        delete users[socket.id]
    });



});



