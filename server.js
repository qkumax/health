const express = require("express");
const mongoose = require("mongoose")
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const session = require("express-session");
var methodOverride = require('method-override');
const {MongoClient, ObjectId} = require("mongodb");
const Doctor = require('../couldnt-create-a-name/bd/doctors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({extended: false}));
app.use(methodOverride('_method'))
app.use(session({
    secret: "secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, 
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));

mongoose.connect('mongodb://localhost:27017/healthcare', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error(err));

// app.use((req, res, next) => {
//     console.log(`Request Method: ${req.method}`); // Should show PUT if override works
//     next();
// });

app.set("view engine", "ejs");

const PORT = 4000;
let db;

async function connect(){
    try{
        const connection = await MongoClient.connect(process.env.DB_LINK);
        db = connection.db();
    }catch(error){
        throw error;
    }
}
connect();

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


app.get('/register', (req, res)=>{
    res.render("registerpage", {messages: [], name: '', email: ''});
});

app.get('/login', (req, res)=>{
    res.render("loginpage", {messages: [], email: ''});
});

app.get('/home', async (req, res)=>{
    if(!req.session.user){
        res.redirect('/login');
    }else{
        try{
            res.render('homepage');
        }catch(error){
            res.status(500).send(error.toString());
        }
    }
});


app.get('/services', async (req, res)=>{
    try{
        if(!req.session.user){
            res.redirect('/login');
 } else {
            let services = await db.collection("services").find().toArray();
            let doctors = await Doctor.find().lean(); // Использование Mongoose для получения списка врачей
            let context = {
                services: services,
                doctors: doctors, // Убедитесь, что doctors добавлены в контекст
                admin: req.session.user.permissions !== 'user'
            };
            res.render("services", context);
        }
    } catch (error) {
        res.status(500).send(error.toString());
    }

    app.get('/contact', async (req, res)=>{
        if(!req.session.user){
            res.redirect('/login');
        }else{
            try{
                res.render('contactpage',{
                    pageTitle:'Contact Us',
                });
            }catch(error){
                res.status(500).send(error.toString());
            }
        }
    });
    

// Эндпоинт для отображения списка врачей
app.get('/services', async (req, res) => {
    try {
        const doctors = await db.collection('doctors').find().toArray();
        res.render('services', { services}); // Используйте 'services', а не 'doctors'
    } catch (error) {
        res.status(500).send("Server error while retrieving the list of doctors");
    }
});

// Эндпоинт для обработки записи на прием
app.post('/appointments', async (req, res) => {
    const { doctor, date } = req.body;
    const appointmentTime = 30; // продолжительность приема в минутах
    const startTime = new Date(date + "T10:00:00"); // начало работы врачей
    const endTime = new Date(date + "T18:00:00"); // конец работы врачей

    try {
        // Проверяем, не выходной ли это день
        if (startTime.getDay() === 0 || startTime.getDay() === 6) {
            return res.status(400).send("Выходной день. Запись невозможна.");
        }

        // Ищем свободное время для записи
        let appointment = await db.collection('appointments').findOne({
            doctor: ObjectId(doctor),
            date: {
                $gte: startTime,
                $lt: endTime
            }
        });

        if (appointment) {
            return res.status(400).send("Запись занята.");
        }

        // Если свободное время найдено, записываем пациента
        await db.collection('appointments').insertOne({
            doctor: ObjectId(doctor),
            date: startTime
        });

        res.send("Запись успешна.");
    } catch (error) {
        res.status(500).send("Ошибка сервера при попытке записи" + error.message);
    }
});

});






app.post('/register', async (req, res)=>{
    let {name, email, password, cpassword} = req.body;
    let messages = [];
    
    if(!name || !email || !password || !cpassword){
        messages.push({message: "Please fill all fields"});
    }
    if(password != cpassword){
        messages.push({message: "Passwords do not match"});
    }
    if(password.length < 6){
        messages.push({message: "Password has less than 6 characters"});
    }
    if(messages.length != 0){
        res.render("registerpage", {messages, name, email});
    }else{
        let hashedpass = await bcrypt.hash(password, 10);
        try{
            let checkemail = await db.collection("users").findOne({"email": email});
            if(checkemail){
                messages.push({message: "Email is already in use"});
                res.render("registerpage", {messages, name, email: ''});
            }else{
                await db.collection("users").insertOne({"name": name, "email": email, "password": hashedpass, "permissions": "user"});
                messages.push({message: "Successfully registered"});
                let info = await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: "Registration",
                    text: "You have successfully registered."
                });
                console.log("Message sent: " + info.messageId);
                res.render("registerpage",{messages, name: '', email: ''});
            }
        }catch(error){
            res.status(500).send(error);
        }
    }
});

app.post('/login', async (req, res)=>{
    let {email, password} = req.body;
    let messages = [];
    if(!email || !password){
        messages.push({message: "Please fill all fields"});
    }
    try{
        let checkemail = await db.collection("users").findOne({"email": email});
        if(checkemail){
            const isMatch = await bcrypt.compare(password, checkemail.password);
            if(isMatch){
                req.session.user = checkemail;
                res.redirect("/home");
            }else{
                messages.push({message: "Wrong password"});
                res.render("loginpage", {messages, email});
            }
        }else{
            messages.push({message: "Such email is not registered"});
            res.render("loginpage", {messages, email});
        }
    }catch(error){
        res.status(500).send(error);
    }
});

app.post('/logout', async (req, res)=>{
    try{
        req.session.destroy();
        res.redirect('/login');
    }catch(error){
        res.status(500).send(error);
    }
});


// Редактирование записи врача
app.put('/doctors/:id', async (req, res) => {
    let { name, specialty, bio } = req.body; // Пример полей, которые вы можете захотеть редактировать
    try {
        const id = req.params.id;
        const doctor = { name, specialty, bio, timestamp: new Date() };
        const result = await db.collection("doctors").updateOne({_id: new ObjectId(id)}, {$set: doctor});
        if (result.modifiedCount === 0) {
            res.status(404).send("Doctor not found"); // Используйте статус 404 для "Не найдено"
        } else {
            res.redirect('/doctors');
        }
    } catch (error) {
        res.status(500).send("Error updating doctor: " + error.message);
    }
});

// Удаление записи врача
app.delete('/doctors/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await db.collection("doctors").deleteOne({_id: new ObjectId(id)});
        if (result.deletedCount === 0) {
            res.status(404).send("Doctor not found"); // Используйте статус 404 для "Не найдено"
        } else {
            res.redirect('/doctors');
        }
    } catch (error) {
        res.status(500).send("Error deleting doctor: " + error.message);
    }
});




app.listen(PORT, ()=>{
    console.log("Server runs at port " + PORT);
});