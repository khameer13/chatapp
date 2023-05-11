const socket = io('http://localhost:8000');


const form = document.getElementById('send-container');
const messageInput = document.getElementById('messageInp')
const messageContainer = document.querySelector(".chatcontainer")

const append = (message, position) => {
    const messageElement = document.createElement('div');
    messageElement.innerText = message;
    messageElement.classList.add('message')
    messageElement.classList.add(position);
    messageContainer.append(messageElement);
}


form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value;
    append(`you:${message}`, 'right');
    socket.emit('send', message);
    messageInput.value = ''
})
const kname = prompt("Enter your name");

socket.emit('new-user-joined', kname);

socket.on('user-joined', kname => {
    append(`${kname}: Joined the chat`, 'center')
})

socket.on('receive', data => {
    append(`${data.kname} : ${data.message}`, 'left')
})

socket.on('left', kname => {
    append(`${kname}: Left the chat `, 'center')
})
