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
