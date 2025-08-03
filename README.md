# Intelligent Financial Advisor System

## 0. Download the AI_related file into:

Download Link: https://drive.google.com/drive/folders/171m0BQTam_DZ7QKlS1yVJQhuSTeCJkI4?usp=sharing

Put the "AI_related" file you have downloaded into:

```
ai-finadvisor/backend/python-service/blueprints/AI_related 
```

## 1. Environment settring

```
cd ai-finadvisor
```

## 2. Run Python file

run app.py or:

```
python3 -m venv .venv
source .venv/bin/activate
```

```
pip install -r requirements.txt
```

```
python backend/python-service/app.py
```

## 3. Run backend and frontend

```
cd backend
npm install
npm start
```

You can open a new terminal:

```
cd frontend
npm install
npm start
```
## 4. Install mkcert
```
Please install mkcert to create a new local CA to host HTTPS
https://github.com/FiloSottile/mkcert

Generate new certificates:
Please refer to Github for installation details. The example installation are as follow: 

cd ai-finadvisor
brew install mkcert
cd frontend
mkcert -install
cd backend
mkcert -install

Addiontally, if error exist after installation, try following: 
Navigate to the application “backend\ssl” and run “mkcert -install”, 
Then run " mkdir ssl" and "mkcert -key-file ssl/key.pem -cert-file ssl/cert.pem localhost 127.0.0.1 ::1" . 
Then copy the generated keys to “frontend\ssl”
```

