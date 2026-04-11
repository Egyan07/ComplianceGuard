# ComplianceGuard SOC 2 Automation Platform

ComplianceGuard is a comprehensive SOC 2 compliance automation platform that streamlines the process of implementing, monitoring, and maintaining SOC 2 compliance frameworks. The platform provides automated evidence collection, compliance tracking, and audit preparation tools.

## Features

### Core Capabilities
- **SOC 2 Framework Management**: Complete implementation of SOC 2 Trust Service Criteria
- **Automated Evidence Collection**: Integration with AWS services and other data sources
- **Real-time Compliance Monitoring**: Dashboard for tracking compliance status
- **User Management**: Role-based access control with secure authentication
- **Company Profiles**: Multi-tenant support for managing multiple organizations
- **Audit Trail**: Comprehensive logging and evidence tracking

### Technical Stack
- **Frontend**: React 18 with TypeScript, Material-UI, React Query
- **Backend**: FastAPI with Python 3.10+, SQLAlchemy ORM
- **Database**: PostgreSQL (production), SQLite (development)
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Deployment**: Docker containers with docker-compose orchestration

## Quick Start

### Prerequisites
- Docker 20.10+
- Docker Compose 2.20+
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd complianceguard
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

3. **Start the application using Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Manual Setup (Development)

#### Backend Setup
1. **Create virtual environment**
   ```bash
   cd complianceguard/backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   ```bash
   cp ../.env.example .env
   # Edit .env file as needed
   ```

4. **Run the backend server**
   ```bash
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

#### Frontend Setup
1. **Navigate to frontend directory**
   ```bash
   cd complianceguard/frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

## Project Structure

```
complianceguard/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/            # API endpoints
│   │   │   ├── auth.py     # Authentication routes
│   │   │   ├── compliance.py # SOC 2 compliance routes
│   │   │   └── evidence.py   # Evidence collection routes
│   │   ├── models/         # SQLAlchemy models
│   │   │   ├── user.py     # User management
│   │   │   ├── company.py  # Company profiles
│   │   │   └── compliance.py # SOC 2 frameworks
│   │   ├── integrations/  # External service integrations
│   │   │   └── aws.py     # AWS evidence collection
│   │   ├── database/      # Database configuration
│   │   │   └── base.py    # Database setup
│   │   └── main.py        # FastAPI application entry point
│   ├── tests/             # Comprehensive test suite
│   │   ├── unit/          # Unit tests
│   │   ├── integration/   # Integration tests
│   │   └── e2e/           # End-to-end tests
│   ├── Dockerfile         # Backend container configuration
│   └── requirements.txt   # Python dependencies
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── auth/       # Authentication components
│   │   │   ├── dashboard/  # Dashboard components
│   │   │   ├── compliance/ # SOC 2 compliance components
│   │   │   └── layout/     # Layout components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API service functions
│   │   ├── stores/        # State management (Zustand)
│   │   ├── utils/         # Utility functions
│   │   ├── App.tsx        # Main application component
│   │   └── main.tsx       # Application entry point
│   ├── tests/             # Frontend tests
│   ├── Dockerfile         # Frontend container configuration
│   ├── package.json       # NPM dependencies
│   └── tsconfig.json      # TypeScript configuration
├── docker-compose.yml      # Multi-container orchestration
├── .env.example           # Environment variable examples
└── README.md              # This file
```

## Configuration

### Environment Variables

The application uses environment variables for configuration. Copy `.env.example` to `.env` and customize as needed:

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/complianceguard

# Security Configuration
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALGORITHM=HS256

# AWS Integration (for evidence collection)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1

# Application Configuration
ENVIRONMENT=development  # or production
DEBUG=true

# Frontend Configuration
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_TITLE=ComplianceGuard SOC 2 Platform
```

### SOC 2 Framework Configuration

The platform includes pre-configured SOC 2 Trust Service Criteria:

1. **Security**: Common Criteria (CC1-CC9)
2. **Availability**: System availability monitoring
3. **Processing Integrity**: Data processing controls
4. **Confidentiality**: Information protection
5. **Privacy**: Personal information handling

Each framework includes:
- Control objectives
- Implementation requirements
- Evidence collection procedures
- Testing procedures

## API Documentation

The backend API provides comprehensive REST endpoints:

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user profile

### SOC 2 Compliance
- `GET /api/v1/compliance/frameworks` - List compliance frameworks
- `GET /api/v1/compliance/frameworks/{id}` - Get framework details
- `POST /api/v1/compliance/assessments` - Create compliance assessment
- `GET /api/v1/compliance/assessments/{id}` - Get assessment results

### Evidence Collection
- `GET /api/v1/evidence/collections` - List evidence collections
- `POST /api/v1/evidence/collections` - Start evidence collection
- `GET /api/v1/evidence/{id}` - Get evidence details
- `POST /api/v1/evidence/{id}/validate` - Validate evidence

### Health Checks
- `GET /health` - Service health status
- `GET /` - API information

Interactive API documentation is available at `/docs` (Swagger UI) and `/redoc` (ReDoc).

## Docker Deployment

### Production Deployment

1. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit production settings
   ```

2. **Deploy with docker-compose**
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

3. **Verify deployment**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

### Docker Services

- **complianceguard-backend**: FastAPI application on port 8000
- **complianceguard-frontend**: React application on port 3000
- **complianceguard-db**: PostgreSQL database on port 5432

### Container Management

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f [service-name]

# Restart services
docker-compose restart [service-name]

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

## Development

### Running Tests

#### Backend Tests
```bash
cd backend
python -m pytest tests/ -v
python -m pytest tests/ --cov=app --cov-report=html
```

#### Frontend Tests
```bash
cd frontend
npm test
npm run test:coverage
```

### Code Quality

#### Backend
```bash
# Format code
black app/ tests/

# Sort imports
isort app/ tests/

# Lint code
flake8 app/ tests/
```

#### Frontend
```bash
# Lint TypeScript/React code
npm run lint

# Auto-fix linting issues
npm run lint -- --fix
```

### Database Migrations

The application uses Alembic for database migrations:

```bash
cd backend
alembic revision --autogenerate -m "Description of changes"
alembic upgrade head
```

## SOC 2 Implementation

### Trust Service Criteria

The platform implements all five SOC 2 Trust Service Criteria:

#### 1. Security (Common Criteria)
- **CC1**: Control Environment
- **CC2**: Communication
- **CC3**: Risk Assessment
- **CC4**: Monitoring
- **CC5**: Control Activities
- **CC6**: Logical and Physical Access
- **CC7**: System Operations
- **CC8**: Change Management
- **CC9**: Business Continuity

#### 2. Availability
- System availability monitoring
- Performance metrics collection
- Incident response procedures

#### 3. Processing Integrity
- Data validation controls
- Processing accuracy verification
- System performance monitoring

#### 4. Confidentiality
- Information classification
- Access control management
- Data encryption procedures

#### 5. Privacy
- Personal information inventory
- Consent management
- Data subject rights handling

### Evidence Collection

The platform automates evidence collection through:

1. **AWS Integration**
   - CloudTrail logs for access monitoring
   - Config snapshots for configuration management
   - CloudWatch metrics for system monitoring

2. **System Logs**
   - Application audit logs
   - Authentication logs
   - System performance logs

3. **Manual Evidence Upload**
   - Policy documents
   - Procedure documentation
   - Training records

## Security

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Password hashing with bcrypt
- Secure session management

### Data Protection
- Database encryption at rest
- TLS encryption in transit
- Secure credential storage
- Audit logging for all sensitive operations

### API Security
- Rate limiting
- Input validation and sanitization
- CORS configuration
- Security headers

## Monitoring & Logging

### Application Monitoring
- Health check endpoints
- Performance metrics
- Error tracking
- Usage analytics

### Audit Logging
- User activity logging
- System changes tracking
- Security event monitoring
- Compliance evidence logging

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   ```bash
   # Check database connectivity
   docker-compose exec db psql -U postgres

   # Verify database URL format
   # postgresql://user:password@host:port/database
   ```

2. **Port Conflicts**
   ```bash
   # Check if ports are in use
   lsof -i :8000
   lsof -i :3000

   # Modify ports in docker-compose.yml
   ```

3. **Build Failures**
   ```bash
   # Clean build cache
   docker-compose down --rmi all
   docker-compose build --no-cache
   ```

### Debug Mode

Enable debug mode in `.env`:
```
DEBUG=true
ENVIRONMENT=development
```

This enables:
- Detailed error messages
- Hot reloading
- Debug logging
- CORS for all origins

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Development Guidelines
- Follow PEP 8 for Python code
- Use TypeScript best practices for frontend
- Write comprehensive tests
- Update documentation for new features
- Ensure security best practices

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review API documentation at `/docs`

## Version History

- **v0.1.0**: Initial release with SOC 2 framework support
- **v0.2.0**: Added AWS integration for evidence collection
- **v0.3.0**: Enhanced frontend dashboard and reporting

## Roadmap

- [ ] Multi-framework support (ISO 27001, HIPAA)
- [ ] Advanced reporting and analytics
- [ ] Automated control testing
- [ ] Integration with additional cloud providers
- [ ] Mobile application
- [ ] Advanced workflow automation

---

**ComplianceGuard SOC 2 Automation Platform** - Streamline your compliance journey with automated evidence collection and real-time monitoring.
