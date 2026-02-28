# interviewPrepper - Interview Preparation Helper

An AI-powered interview preparation and learning platform that generates personalized 30-day learning plans based on job posting requirements. Simply paste a job URL, and interviewPrepper will analyze the requirements and create a comprehensive study roadmap tailored to help you succeed.

## ✨ Features

- 🤖 **AI-Powered Plan Generation** - Leverages LangChain and LangGraph with multi-provider LLM support (OpenAI, Gemini, OpenRouter)
- 🔍 **Smart Job Analysis** - Automatically scrapes and analyzes job postings using Firecrawl
- 💬 **Interactive Refinement** - Chat with the AI to customize and refine your learning plan
- 📄 **PDF Export** - Download your personalized plan as a beautifully formatted PDF
- 🔐 **Secure Authentication** - JWT-based user authentication and authorization
- 🌙 **Modern UI** - Clean, responsive interface with dark mode support
- 💾 **Persistent Storage** - SQLite database to save and manage multiple learning plans
- 🔄 **Thread Management** - Easily switch between different job applications and their plans

## 🛠️ Tech Stack

### Backend
- **FastAPI** - High-performance Python web framework
- **LangChain & LangGraph** - Advanced AI orchestration and multi-step reasoning
- **SQLAlchemy** - Database ORM for data persistence
- **Multi-LLM Support** - Choose from OpenAI GPT, Google Gemini, or OpenRouter models
- **Python 3.11+** - Modern Python with type hints

### Frontend
- **React 18** - Modern React with hooks
- **Vite** - Lightning-fast build tool and dev server
- **Axios** - Promise-based HTTP client
- **React Markdown** - Beautiful markdown rendering
- **Modern CSS** - Custom styling with dark mode

### External Services
- **Firecrawl** - Web scraping and content extraction
- **Tavily** - AI-powered search for additional research
- **LangSmith** (optional) - LLM observability and debugging

## 🚀 Getting Started


### Prerequisites

- **Docker & Docker Compose** (recommended) OR **Python 3.11+** and **Node.js 18+**
- API keys for the following services:
  - [OpenAI](https://platform.openai.com/api-keys) (for GPT models)
  - [Firecrawl](https://firecrawl.dev/) (for web scraping)
  - [Tavily](https://tavily.com/) (for AI search)
  - [LangSmith](https://smith.langchain.com/) (optional, for tracing)

### Installing Docker (Recommended)

If you don't have Docker installed, follow the instructions for your operating system:

#### Windows

1. **Download Docker Desktop for Windows:**
   - Visit [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
   - Download the installer
   
2. **Install Docker Desktop:**
   - Run the installer (Docker Desktop Installer.exe)
   - Follow the installation wizard
   - Enable WSL 2 during installation (recommended)
   
3. **Start Docker Desktop:**
   - Launch Docker Desktop from the Start menu
   - Wait for Docker to start (you'll see a green light in the system tray)
   
4. **Verify installation:**
   ```bash
   docker --version
   docker compose version
   ```

#### macOS

1. **Download Docker Desktop for Mac:**
   - Visit [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
   - Choose the appropriate version:
     - **Apple Silicon (M1/M2/M3):** Download for Apple chip
     - **Intel chip:** Download for Intel chip
   
2. **Install Docker Desktop:**
   - Open the downloaded `.dmg` file
   - Drag Docker to the Applications folder
   
3. **Start Docker Desktop:**
   - Launch Docker from Applications
   - Accept the service agreement
   - Optionally sign in to Docker Hub
   
4. **Verify installation:**
   ```bash
   docker --version
   docker compose version
   ```

#### Linux (Ubuntu/Debian)

1. **Update package index:**
   ```bash
   sudo apt-get update
   ```

2. **Install required packages:**
   ```bash
   sudo apt-get install ca-certificates curl gnupg lsb-release
   ```

3. **Add Docker's official GPG key:**
   ```bash
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   ```

4. **Set up the repository:**
   ```bash
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   ```

5. **Install Docker Engine:**
   ```bash
   sudo apt-get update
   sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

6. **Add your user to the docker group (to run without sudo):**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

7. **Verify installation:**
   ```bash
   docker --version
   docker compose version
   ```

For other Linux distributions, visit the [official Docker documentation](https://docs.docker.com/engine/install/).


### Environment Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd interviewPrepper
   ```

2. **Create a `.env` file** in the root directory:

```env
# LLM Provider Configuration
LLM_PROVIDER=openai          # Options: openai, gemini, openrouter
LLM_MODEL=gpt-5.1            # Model name for the selected provider
LLM_TEMPERATURE=0.2          # Temperature for LLM responses (0.0-1.0)

# Required API Keys
JWT_SECRET_KEY=your_jwt_secret_key_here    # REQUIRED: Secret key for JWT token generation
FIRECRAWL_API_KEY=your_firecrawl_key
TAVILY_API_KEY=your_tavily_key

# LLM Provider Keys (at least one required)
OPENAI_API_KEY=your_openai_key              # For OpenAI models
GOOGLE_API_KEY=your_google_api_key          # For Google Gemini
OPENROUTER_API_KEY=your_openrouter_api_key  # For OpenRouter

# Frontend Configuration (for Docker builds)
VITE_API_URL=http://localhost:8000

# Optional: LangSmith Tracing (for debugging)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=your_project_name
```

> **⚠️ Important:** The `JWT_SECRET_KEY` is **required** for the application to run. Generate a secure random string for production use:
> ```bash
> # Python
> python -c "import secrets; print(secrets.token_urlsafe(32))"
> 
> # OpenSSL
> openssl rand -base64 32
> ```

### 🤖 LLM Provider Configuration

InterviewPrepper supports multiple LLM providers. Configure your preferred provider using the `LLM_PROVIDER` and `LLM_MODEL` environment variables:

#### OpenAI (Default)
```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.1            # or gpt-5, gpt-5.1-mini, etc.
OPENAI_API_KEY=your_openai_api_key
```

#### Google Gemini
```env
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash   # or gemini-2.5-pro, etc.
GOOGLE_API_KEY=your_google_api_key
```

#### OpenRouter (Access to 100+ Models)
```env
LLM_PROVIDER=openrouter
LLM_MODEL=anthropic/claude-4.5-sonnet  # or any OpenRouter model
OPENROUTER_API_KEY=your_openrouter_api_key
```

## 🐳 Running with Docker (Recommended)

1. **Build and start the containers:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - **Frontend:** http://localhost:3000
   - **Backend API:** http://localhost:8000
   - **API Docs:** http://localhost:8000/docs

3. **Stop the containers:**
   ```bash
   docker-compose down
   ```

## 💻 Running Locally (Development)

### Backend Setup

```bash
cd backend
python -m venv venv

# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate

pip install -r requirements.txt
uvicorn main:app --reload
```

The backend will be available at http://localhost:8000

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:5173

## 📖 How to Use

1. **Register/Login** - Create a new account or sign in with existing credentials
2. **Generate Plan** - Paste a job posting URL and click "Generate Plan"
3. **Review** - The AI will analyze the job requirements and create a 30-day learning roadmap
4. **Refine** - Use the chat interface to ask questions or request modifications to your plan
5. **Export** - Download your finalized plan as a PDF for offline access
6. **Manage** - Access all your saved plans from the sidebar and switch between them

## 📁 Project Structure

```
interviewPrepper/
├── backend/
│   ├── auth.py              # JWT authentication and password hashing
│   ├── database.py          # SQLAlchemy models (User, Thread, Message)
│   ├── logic.py             # LangChain/LangGraph agent implementation
│   ├── main.py              # FastAPI application and endpoints
│   ├── requirements.txt     # Python dependencies
│   ├── Dockerfile           # Backend container configuration
│   └── .dockerignore
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main application component
│   │   ├── Login.jsx        # Authentication component
│   │   ├── config.js        # API configuration
│   │   ├── main.jsx         # React entry point
│   │   └── index.css        # Application styles
│   ├── public/
│   ├── package.json         # Node dependencies
│   ├── vite.config.js       # Vite configuration
│   ├── Dockerfile           # Frontend container (multi-stage with Nginx)
│   ├── nginx.conf           # Nginx configuration for production
│   └── .dockerignore
├── docker-compose.yml       # Container orchestration
├── .env                     # Environment variables (create this)
└── README.md
```

## 🔌 API Endpoints

### Authentication
- `POST /api/register` - Register a new user account
- `POST /api/token` - Login and receive JWT access token

### Threads & Plans
- `GET /api/threads` - Get all threads for the authenticated user
- `POST /api/threads` - Create a new thread with AI-generated learning plan
- `GET /api/threads/{thread_id}` - Get a specific thread with messages
- `POST /api/threads/{thread_id}/chat` - Send a message to refine the plan
- `GET /api/threads/{thread_id}/download` - Download the plan as PDF

### Health
- `GET /health` - Health check endpoint

Full interactive API documentation is available at http://localhost:8000/docs when running the backend.

## 🐛 Troubleshooting

### Common Issues

**"JWT_SECRET_KEY environment variable is not set" error:**
- Ensure you've created a `.env` file in the root directory with `JWT_SECRET_KEY` set
- Generate a secure key using: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- For Docker: Verify the `.env` file exists and `docker-compose.yml` passes the variable to the backend service

**"Module not found" errors:**
- Ensure you've activated the virtual environment and installed dependencies
- Run `pip install -r requirements.txt` in the backend directory

**Frontend shows white screen or not loading:**
- Check browser console for JavaScript errors (F12 → Console)
- Ensure backend is running and accessible at the configured API URL
- Verify all React hooks are properly ordered (effects after their dependencies)

**Frontend not connecting to backend:**
- Check that the backend is running on port 8000
- Verify CORS settings in `main.py`
- Check `frontend/src/config.js` for the correct API URL
- For Docker: Ensure `VITE_API_URL` is set correctly in `.env`

**Database errors:**
- Delete `data.db` and restart the backend to recreate the database
- Ensure SQLite is available on your system

**PDF download fails:**
- Check backend logs for encoding errors
- Ensure `xhtml2pdf` and `markdown` packages are installed
- Verify the plan content doesn't contain problematic Unicode characters

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows the existing style and includes appropriate tests.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [LangChain](https://langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraph/)
- Web scraping powered by [Firecrawl](https://firecrawl.dev/)
- AI search provided by [Tavily](https://tavily.com/)
- UI inspired by modern design principles

---

**Made with ❤️ for job seekers preparing for their dream roles**