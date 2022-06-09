FROM node:16-alpine as build
WORKDIR /usr/app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src src

RUN npm run build

FROM node:14-alpine
WORKDIR /usr/app
COPY package.json ./
RUN npm install --production --no-optional
RUN npm install source-map-support
COPY --from=build /usr/app/dist dist
COPY tsconfig.json ./

CMD [ "npm", "start" ]
