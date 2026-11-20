
# Paperhouse Inc. AI Video Creator

An AI-assisted video creation application.

## Features

- Gemini AI story generation
- One-prompt storyboard creation
- Up to 3-minute story plans
- Automatic dialogue and captions
- SRT subtitle export
- 360p and 720p MP4 compilation
- FFmpeg video processing
- Mobile responsive design
- No Firebase
- No Google Sign-in

## Requirements

- Node.js 20+
- FFmpeg
- Gemini API key
- Video generation provider for automatic footage generation

## Installation

1. Download or clone this repository.
2. Install dependencies:

npm install

3. Copy .env.example to .env.
4. Add your Gemini API key.
5. Start the application:

npm start

6. Open:

http://localhost:3000

## Important

Gemini generates the storyboard, dialogue and timed captions.

Actual video footage generation requires a compatible
video-generation service. Uploaded clips can be
automatically compiled using FFmpeg.

Never upload your .env file or private API key to GitHub.
