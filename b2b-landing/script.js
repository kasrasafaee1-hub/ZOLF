document.getElementById("year").textContent = new Date().getFullYear();

const videoEmbed = document.getElementById("video-embed");
const videoId = videoEmbed.dataset.videoId;
if (videoId && videoId !== "REPLACE_WITH_YOUTUBE_ID") {
  videoEmbed.innerHTML = `<iframe
    src="https://www.youtube.com/embed/${videoId}"
    title="Strategy call preview"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
  ></iframe>`;
}

const calendlyEmbed = document.querySelector(".calendly-embed");
const calendlyUrl = calendlyEmbed.dataset.calendlyUrl;
if (calendlyUrl && calendlyUrl !== "REPLACE_WITH_CALENDLY_URL") {
  calendlyEmbed.innerHTML = `<iframe
    src="${calendlyUrl}"
    title="Book a strategy call"
  ></iframe>`;
}
