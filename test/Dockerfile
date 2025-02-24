FROM node:22-alpine
WORKDIR /usr/app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src src
COPY files files
ENTRYPOINT [ "npm" ]
CMD [ "test" ]
