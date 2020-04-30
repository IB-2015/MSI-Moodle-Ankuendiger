require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const chrome = require('selenium-webdriver/chrome');
const webdriver = require('selenium-webdriver');
const { By } = webdriver;
const fs = require('fs');

// logging: https://cloud.google.com/logging/docs/setup/nodejs?hl=de
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    // new winston.transports.File({ filename: `${__dirname}/service.access.log` })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: `${__dirname}/service.error.log` })
  ]
});

const URLs = [
  {
    course: 'SWE',
    url: 'https://moodle.hs-mannheim.de/course/view.php?id=3182',
  },
  {
    course: 'REQ',
    url: 'https://moodle.hs-mannheim.de/course/view.php?id=3162',
  },
  {
    course: 'MSI',
    url: 'https://moodle.hs-mannheim.de/course/view.php?id=3161',
  },
  {
    course: 'IM_SS20',
    url: 'https://moodle.hs-mannheim.de/course/view.php?id=3160',
  },
  {
    course: 'MSP',
    url: 'https://moodle.hs-mannheim.de/course/view.php?id=3092',
  },
  {
    course: 'KPT',
    url: 'https://moodle.hs-mannheim.de/course/view.php?id=2459',
  },
  {
    course: 'SWA',
    url: 'https://moodle.hs-mannheim.de/course/view.php?id=3278',
  }

];

(async () => {
  const screen = {
    width: 640,
    height: 480
  };

  let driver = new webdriver.Builder()
    .setChromeOptions(new chrome.Options().headless().windowSize(screen))
    .withCapabilities(webdriver.Capabilities.chrome())
    .build();

  const job = async () => {
    console.time('job');
    for (const i in URLs) {
      let { course, url } = URLs[i];
      await driver.get(url);
      logger.info(await driver.getTitle());

      // login required
      if (await driver.getTitle() == 'Lernplattform HSMA: Hier können Sie sich anmelden') {        
        await driver.findElement(By.id('username')).sendKeys(process.env.usr);
        await driver.findElement(By.id('password')).sendKeys(process.env.password);
        await driver.findElement(By.id('loginbtn')).click();
        logger.info(await driver.getTitle());
      }

      const elements = await driver.findElements(By.className('instancename'));

      for (e of elements) {
        if (await e.getText() == 'Ankündigungen') {
          await e.click();
          break;
        }
      }

      // check, whether notification tale exists, continue with next course when table does no exist
      try {
        await driver.findElement(By.className('forumheaderlist'));
      } catch (error) {
        continue;
      }

      const tBody = await driver.findElement(By.tagName('tbody'));
      const rows = await tBody.findElements(By.tagName('tr'));
      const notificationLinks = [];
      let topicIndex = 0;
      for (r of rows) {
        const data = await r.findElements(By.tagName('td'));

        const topic = await data[0].getText();
        const link = await data[0].findElement(By.tagName('a')).getAttribute('href');
        const t = await data[3].getText();
        const by = t.split('\n')[0];
        const time = t.split('\n')[1];
        
        logger.info(`${topic}, ${await data[1].getText()}, ${await data[2].getText()}, ${by}, ${time}, ${link}`);
        notificationLinks.push({ topic, link, by, time, topicIndex });
        topicIndex++;
      }

      for ({ topic, link, by, topicIndex } of notificationLinks) {
        await driver.get(link);
        const posts = await driver.findElements(By.className('forumpost'));

        let postIndex = posts.length - 1;
        for (const p of posts) {
          const post = await p.findElement(By.className('posting'));

          const notificationBody = await post.getText();

          const time = await p.findElement(By.tagName('time'))
          const file = Date.parse(await time.getAttribute('datetime'));
          const dir = `${__dirname}/data`;
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
          }

          course = course == 'SWE_KAE' ? 'SWE' : course;
          const notificationHeader = `${by} veröffentlichte im Kurs ${course} einen Beitrag am ${await time.getText()} zum Thema ${topic}. Möchtest du ihn hören?\n`;
          notification = notificationHeader.concat(notificationBody);

          fs.writeFile(`${__dirname}/data/${file}%%${course}%%${topic.replace(/\./g, '_').replace(/:/g, '__')}%%${topicIndex}%%${postIndex}.txt`, notification, { encoding: 'utf8', flag: 'w' }, function (err) {
            if (err) return logger.info(err);
          });

          URLs[i].notification = notification;
          postIndex--;

        }
      }
    }

    console.timeEnd('job');
  };

  setInterval(() => {
    job();
  }, 60 * 1000);

})()

// support parsing of application/json type post data
app.use(bodyParser.json());

//support parsing of application/x-www-form-urlencoded post data
app.use(bodyParser.urlencoded({ extended: true }));

// get a notification post based on the course, topicIndex and postIndex
app.get('/moodle', async (req, res) => {
  let { course, topicIndex, postIndex } = req.query;
  topicIndex = parseInt(topicIndex);
  postIndex = parseInt(postIndex);

  let post = {};
  let notification = undefined;
  let postError = undefined;
  let topicError = undefined;
  try {
    const files = fs.readdirSync(`${__dirname}/data`).map(file => {
      const parts = file.split('%%');

      return { ts: parseInt(file), file: file, course: parts[1], topic: parts[2].replace(/_/g, '.').replace(/__/g, ':'), topicIndex: parseInt(parts[3]) }
    }).filter(f => f.course == course && f.topicIndex == topicIndex);


    if (files.length == 0) {
      topicError = true;
      throw Error('topic error')
    }

    files.sort((a, b) => b.ts - a.ts)

    if (postIndex >= files.length || postIndex < 0) {
      postError = true
      post.topic = files[0].topic;
      throw Error('post error');
    }

    post = files[postIndex];

    notification = fs.readFileSync(`${__dirname}/data/${post.file}`, 'utf8');
  } catch (error) {
    notification = undefined;
  }

  if (notification == undefined) {
    const fallbackNotification = {
      course: course,
      topic: post.topic,
      topicIndex: topicIndex,
      postIndex: postIndex
    };

    if (postError == true) {
      fallbackNotification.header = `Für ${course} liegen keine weiteren Meldungen zum Thema ${post.topic} vor.`;
    }

    if (topicError == true) {
      fallbackNotification.header = `Für ${course} liegen keine weiteren Themen vor.`
    }
    

    res.send(fallbackNotification);
    return;
  } else {
    const cache = notification.split('\n');
    post.header = cache[0];
    post.body = cache.slice(1).join('\n');
    post.course = course;
    post.topicIndex = topicIndex;
    post.postIndex = postIndex;

    res.send(post);
    return;
  }
});

// get the latest post of each topic of each course
app.post('/moodle', async (req, res) => {
  let courses = req.body.data.courses;

  const notifications = [];
  if (courses == null || courses == undefined || courses.length == 0) {

    try {
      const files = fs.readdirSync(`${__dirname}/data`).map(file => {
        const parts = file.split('%%');

        return { ts: parseInt(file), file: file, course: parts[1], topic: parts[2].replace(/_/g, '.').replace(/__/g, ':'), topicIndex: parseInt(parts[3]), postIndex: parseInt(parts[4].split('.')[0]) }
      });
      files.sort((a, b) => b.ts - a.ts);

      files.forEach(f => {
        const notification = fs.readFileSync(`${__dirname}/data/${f.file}`, 'utf8');
        const cache = notification.split('\n');
        notifications.push({
          header: cache[0],
          body: cache.slice(1).join('\n'),
          course: f.course,
          topic: f.topic,
          topicIndex: f.topicIndex,
          postIndex: f.postIndex, // latest post
          ts: f.ts
        });
      });

      res.send(notifications);
      return;

    } catch (error) {
      notification = undefined;
    }
  } else {

    for (const course of courses) {

      try {
        let files = fs.readdirSync(`${__dirname}/data`).map(file => {
          const parts = file.split('%%');

          return { ts: parseInt(file), file: file, course: parts[1], topic: parts[2].replace(/_/g, '.').replace(/__/g, ':'), topicIndex: parseInt(parts[3]), postIndex: parseInt(parts[4].split('.')[0]) }
        }).filter(f => f.course == course);
        files.sort((a, b) => b.ts - a.ts);

        const onlyUnique = (value, index, self) => {
          return self.findIndex(x => x.topicIndex == value.topicIndex) === index;
        }

        files = files.filter(onlyUnique);

        files.forEach(f => {
          const notification = fs.readFileSync(`${__dirname}/data/${f.file}`, 'utf8');
          const cache = notification.split('\n');
          notifications.push({
            header: cache[0],
            body: cache.slice(1).join('\n'),
            course: f.course,
            topic: f.topic,
            topicIndex: f.topicIndex,
            postIndex: f.postIndex, // latest post
            ts: f.ts
          });
        });

      } catch (error) {
        console.log(error);

        notification = undefined;
      }
    }

    notifications.sort((a, b) => b.ts - a.ts);
    res.send(notifications);
    return;
  }
});

// start server
const port = 3000;
app.listen(port, function () {
  logger.info(`Example app listening on port ${port}!`);
});
