# Use an official Node runtime as the base image
FROM node:18

# Add environment variable
ARG GAME_ENV=preprod
ENV GAME_ENV=$GAME_ENV

# Set the working directory in the container
WORKDIR /usr/src/app
# Copy package.json and package-lock.json
COPY package*.json ./
# Install dependencies
RUN npm install
# Copy the rest of the application code
COPY . .
# Build the client-side application
RUN npm run build-prod
# Expose the port the app runs on
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013 3014 3015
# Define the command to run the app
CMD ["npm", "run", "start:server"]