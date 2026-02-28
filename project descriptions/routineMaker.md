![Screenshot](https://github.com/NFRohan/routineMaker/blob/main/routine_Epox.png "Sample Routine")
<details>
<summary>Click to expand local development instructions</summary>

#### Backend Services

**Auth Service:**
```bash
cd auth_service
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8001
```

**Backend Service:**
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Access at http://localhost:5173

</details>

---

## 📖 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT token |
| GET | `/api/auth/me` | Get current user info |

### Routine Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/routines/` | Create new routine |
| GET | `/api/routines/mine` | Get user's routines |
| GET | `/api/routines/{id}` | Get routine details |
| PUT | `/api/routines/{id}` | Update routine settings |
| DELETE | `/api/routines/{id}` | Delete routine |

### Session Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/routines/{id}/sessions` | Add class session |
| DELETE | `/api/sessions/{id}` | Delete session |
| PUT | `/api/sessions/{id}/cancel` | Toggle session cancellation |

### Export Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/routines/{id}/export/pdf` | Download PDF |

For complete API documentation, visit:
- Auth Service: http://localhost:3000/api/auth/docs
- Backend Service: http://localhost:3000/api/docs

---

## 🐳 Docker Commands

### Basic Operations

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild and restart
docker-compose up --build -d

# Reset database (⚠️ Deletes all data!)
docker-compose down -v
docker-compose up -d
```

### Service-Specific Commands

```bash
# View specific service logs
docker-compose logs -f backend
docker-compose logs -f auth_service

# Restart a service
docker-compose restart nginx

# Access database
docker-compose exec db psql -U routinemaker -d routinemaker

# Backup database
docker-compose exec db pg_dump -U routinemaker routinemaker > backup.sql
```

---

## 📂 Project Structure

```
RoutineMaker/
├── auth_service/          # Authentication microservice
│   ├── main.py           # FastAPI app
│   ├── models.py         # User model
│   ├── schemas.py        # Pydantic schemas
│   ├── auth.py           # JWT utilities
│   ├── database.py       # DB configuration
│   ├── Dockerfile        # Container definition
│   └── requirements.txt  # Python dependencies
│
├── backend/              # Main backend service
│   ├── main.py          # FastAPI app
│   ├── models.py        # Routine & Session models
│   ├── schemas.py       # Pydantic schemas
│   ├── crud.py          # Database operations
│   ├── database.py      # DB configuration
│   ├── pdf_utils.py     # PDF generation
│   ├── Dockerfile       # Container definition
│   └── requirements.txt # Python dependencies
│
├── frontend/            # React frontend
│   ├── src/
│   │   ├── pages/      # Page components
│   │   ├── components/ # Reusable components
│   │   ├── api.js      # API client
│   │   ├── App.jsx     # Main app component
│   │   └── main.jsx    # Entry point
│   ├── Dockerfile      # Multi-stage build
│   ├── nginx.conf      # Nginx config for SPA
│   ├── package.json    # Node dependencies
│   └── vite.config.js  # Vite configuration
│
├── nginx/              # Reverse proxy config
│   └── nginx.conf      # Main Nginx configuration
│
├── docker-compose.yml  # Multi-service orchestration
├── .env.example        # Environment template
├── DEPLOY.md          # Deployment guide
├── SETUP.md           # Development setup
└── README.md          # This file
```

---

## 🔒 Security Features

- ✅ **Password Hashing**: Argon2 algorithm via Passlib
- ✅ **JWT Authentication**: Secure token-based auth
- ✅ **CORS Protection**: Configured origins
- ✅ **SQL Injection Prevention**: SQLAlchemy ORM
- ✅ **Environment Variables**: Secrets not in code
- ✅ **HTTPS Ready**: SSL/TLS configuration support

---

## 🎯 Roadmap

- [ ] Email verification for new users
- [ ] Password reset functionality
- [ ] Routine templates
- [ ] Collaborative editing
- [ ] Mobile app (React Native)
- [ ] Calendar integration (Google Calendar, iCal)
- [ ] Notification system
- [ ] Dark mode
- [ ] Internationalization (i18n)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 👨‍💻 Credits

### Development
- **Created by**: Nayeem Fardin
- **Architecture**: Microservices with Docker
- **AI Assistant**: Google Gemini (Antigravity)
---

## 📞 Support

For issues, questions, or suggestions:
- **Issues**: [GitHub Issues](your-repo-url/issues)
- **Documentation**: See [DEPLOY.md](./DEPLOY.md) and [SETUP.md](./SETUP.md)
---

## 🌟 Show Your Support

Give a ⭐️ if this project helped you!

---

<div align="center">
  
**Built with ❤️ using FastAPI, React, and Docker**

[Documentation](./DEPLOY.md) • [API Docs](http://localhost:3000/api/docs) • [Report Bug](your-repo-url/issues) • [Request Feature](your-repo-url/issues)

</div>