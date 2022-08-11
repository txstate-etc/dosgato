FROM node:18-alpine as build
WORKDIR /usr/app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src src
COPY testserver testserver

RUN npm run buildrun

FROM node:18-alpine
WORKDIR /usr/app
COPY package.json ./
RUN npm install --production --no-optional
COPY --from=build /usr/app/dist dist
COPY tsconfig.json ./

CMD [ "npm", "start" ]
