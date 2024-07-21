const {
    setGlobalOptions
} = require("firebase-functions/v2");
const {
    onRequest
} = require("firebase-functions/v2/https");
setGlobalOptions({
    region: "asia-northeast1",
    memory: "1GB",
    concurrency: 40,
})

const line = require('./util/line.util');
const firebase = require('./util/firebase.util')
const ChatGPT = require('./util/chatGPT.util')
const nodeCache = require('./util/nodeCache.js');

function validateWebhook(request, response) {
    if (request.method !== "POST") {
        return response.status(200).send("Method Not Allowed");
    }
    if (!line.verifySignature(request.headers["x-line-signature"], request.body)) {
        return response.status(401).send("Unauthorized");
    }
}


exports.webhook = onRequest(async (request, response) => {

    // Midleware : Validate Message
    validateWebhook(request, response)

    const events = request.body.events
    for (const event of events) {

        if (event.source.type !== "group") {
            // Display a loading animation in one-on-one chats between users and LINE Official Accounts.
            await line.isAnimationLoading(event.source.userId)
        }

        if (event.type === "follow") {

            const profile = await line.getProfile(event.source.userId)

            await line.replyWithStateless(event.replyToken, [{
                "type": "text",
                "text": `ยินดีต้อนรับคุณ ${profile.displayName}เข้าสู่การประเมิน DISC คุณสามารถเริ่มประเมินได้เลย`,
                "sender": {
                    "name": "BOT",
                    "iconUrl": "https://cdn-icons-png.flaticon.com/512/6349/6349320.png"
                },
                "quickReply": {
                    "items": [{
                        "type": "action",
                        "imageUrl": "https://cdn-icons-png.flaticon.com/512/2339/2339864.png",
                        "action": {
                            "type": "uri",
                            "label": "ประเมิน",
                            "uri": `${process.env.LIFF_ENDPOINT_DISC}`
                        }
                    }]
                }
            }])

        }
        if (event.type === "message" && event.message.type === "text") {
            const profile = await line.getProfile(event.source.userId)
            if (event.message.text === "ฉันได้ประเมินเรียบร้อยแล้ว") {

                let answer = nodeCache.getCache("answer:" + event.source.userId);
                if (answer == undefined) {

                const user = await firebase.getUserAnswer(event.source.userId)


                const image = await ChatGPT.openaiImageRequest(user.description)
                answer = {
                    model: user.model,
                    description: user.description,
                    image: image,
                }
                nodeCache.setCache("answer:" + event.source.userId, answer)
                } 

                await line.replyWithStateless(event.replyToken, [{
                    "type": "text",
                    "text": `คุณ ${profile.displayName} คุณอยู่ในกลุ่ม ${answer.model} \r\n\r\n รายละเอียด ${answer.description}`,
                }, {
                    "type": "image",
                    "originalContentUrl": answer.image,
                    "previewImageUrl": answer.image
                }])


                
            }

        }
    }
    return response.end();

});


exports.createAnswerByUserId = onRequest({ cors: true },async (request, response) => {

    try {
        if (request.method !== "POST") {
            return response.status(200).send("Method Not Allowed");
        }

        const profile = await line.getProfileByIDToken(request.headers.authorization);

        const {
            answers
        } = request.body;
        const answersMapIndex = answers.map((answer, index) => `${index + 1}. ${answer}`);


        const responseModel = await ChatGPT.openaiTextRequest(JSON.stringify(answersMapIndex))
        const cleanedString = responseModel.replace(/json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedString);

        const object = {
            "userId": profile.sub,
            "model": parsed.model,
            "description": parsed.description,
            "Answers": answersMapIndex,
        }
        await firebase.insertUserAnswer(object)

        return response.status(200).json(object).end();

    } catch (error) {
        console.error("Error:", error);
        return response.status(500).send("Internal Server Error");
    }

});