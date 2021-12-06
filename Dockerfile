FROM node:14-alpine as build
WORKDIR /usr/app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src src

RUN npm run compile

FROM node:14-alpine
WORKDIR /usr/app
COPY package.json ./
RUN npm install --production --no-optional
COPY --from=build /usr/app/dist dist

CMD [ "npm", "start" ]
