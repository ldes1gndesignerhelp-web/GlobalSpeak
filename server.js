const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const rooms = new Map(); // roomId -> { name, messages, users }

// Создание комнаты
app.post('/api/create-room', (req, res) => {
    const { name } = req.body;
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    
    rooms.set(roomId, {
        id: roomId,
        name: name || `Комната ${roomId}`,
        createdAt: Date.now(),
        messages: [],
        users: new Map() // socketId -> username
    });
    
    res.json({ roomId, name: rooms.get(roomId).name });
});

// Получение истории
app.get('/api/room/:roomId/messages', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });
    res.json(room.messages);
});

// Получение информации о комнате
app.get('/api/room/:roomId/info', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });
    res.json({ 
        id: room.id, 
        name: room.name,
        userCount: room.users.size 
    });
});

io.on('connection', (socket) => {
    console.log('🔌 Новое подключение:', socket.id);
    
    socket.on('join-room', ({ roomId, username }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', '❌ Комната не найдена');
            return;
        }
        
        // Выход из предыдущей комнаты
        if (socket.currentRoom) {
            const oldRoom = rooms.get(socket.currentRoom);
            if (oldRoom) {
                oldRoom.users.delete(socket.id);
                io.to(socket.currentRoom).emit('user-left', {
                    username: socket.username,
                    users: Array.from(oldRoom.users.values())
                });
            }
            socket.leave(socket.currentRoom);
        }
        
        // Вход в новую комнату
        socket.join(roomId);
        socket.currentRoom = roomId;
        socket.username = username;
        
        room.users.set(socket.id, username);
        
        // Отправляем историю и список пользователей
        socket.emit('room-joined', {
            roomId,
            roomName: room.name,
            messages: room.messages,
            users: Array.from(room.users.values())
        });
        
        // Уведомляем всех в комнате
        io.to(roomId).emit('user-joined', {
            username,
            users: Array.from(room.users.values())
        });
        
        console.log(`👤 ${username} присоединился к ${roomId}`);
    });
    
    socket.on('send-message', ({ text }) => {
        if (!socket.currentRoom || !socket.username) return;
        
        const room = rooms.get(socket.currentRoom);
        if (!room) return;
        
        const message = {
            id: uuidv4(),
            username: socket.username,
            text,
            time: new Date().toLocaleTimeString('ru-RU', { 
                hour: '2-digit', 
                minute: '2-digit' 
            }),
            timestamp: Date.now()
        };
        
        room.messages.push(message);
        io.to(socket.currentRoom).emit('new-message', message);
    });
    
    socket.on('disconnect', () => {
        if (socket.currentRoom && socket.username) {
            const room = rooms.get(socket.currentRoom);
            if (room) {
                room.users.delete(socket.id);
                io.to(socket.currentRoom).emit('user-left', {
                    username: socket.username,
                    users: Array.from(room.users.values())
                });
                console.log(`👋 ${socket.username} покинул ${socket.currentRoom}`);
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║         🌍 GlobalSpeak запущен!            ║
╠════════════════════════════════════════════╣
║  ► Локально: http://localhost:${PORT}       ║
║  ► В сети:    http://[ВАШ_IP]:${PORT}       ║
║  ► Для Hamachi: http://[HAMACHI_IP]:${PORT} ║
╚════════════════════════════════════════════╝
    `);
});