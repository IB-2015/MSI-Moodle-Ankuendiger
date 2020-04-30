require('dotenv').config();
const axios = require('axios').default;

const msiService = axios.create({
    baseURL: process.env.DEV_URL,
    timeout: 5000,
});

(async () => {
    const { data } = await msiService.get(`/moodle`,
        {
            // GET query params
            params: {
                course: 'SWA',
                topicIndex: 0,
                postIndex: 1
            }
        });
    console.log(data);
})();

(async () => {
    const { data } = await msiService.post(`/moodle`,
        {
            // POST, PUT, PATCH body params
            data: {
                courses: ['MSI']
            }
        });
    
    console.log(data);    
})();