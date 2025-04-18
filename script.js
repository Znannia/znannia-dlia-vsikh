// Масив API-ключів для ротації
const API_KEYS = [
     'AIzaSyBIsnxOgHVW7AbYsYLZ6yMUF8f3PZFQFqc',
    'AIzaSyBUIKh8TbT05XmLQTsQq9aXwf0RsiB-GR0',
];
let currentKeyIndex = 0;

const CHANNEL_ID = 'UC0usNaN5iwML35qPxASBDWQ';

// Функція для виконання запитів з ротацією ключів
async function fetchWithKey(url) {
    try {
        const response = await fetch(`${url}&key=${API_KEYS[currentKeyIndex]}`);
        if (!response.ok && (response.status === 403 || response.status === 429)) {
            console.warn(`Помилка ${response.status} для ключа ${currentKeyIndex}. Спробуємо наступний ключ.`);
            currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
            return fetchWithKey(url);
        }
        return response;
    } catch (error) {
        console.error('Помилка запиту:', error);
        throw error;
    }
}

// Отримання кількості підписників
async function fetchSubscribers() {
    const subscribersDiv = document.getElementById('subscribers');
    const cacheKey = 'subscribersCount';
    const cacheTimeKey = 'subscribersTime';
    const cacheDuration = 24 * 60 * 60 * 1000; // 24 години
    const now = new Date();
    const currentTime = now.getTime();
    const hours = now.getHours();

    // Перевірка, чи о 17:00
    const shouldUpdate = hours === 17;
    const cachedSubscribers = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(cacheTimeKey);

    if (cachedSubscribers && cachedTime && currentTime - cachedTime < cacheDuration && !shouldUpdate) {
        subscribersDiv.innerHTML = `Нас уже майже<br><span class="subscribers-count">${cachedSubscribers}</span>`;
        return;
    }

    try {
        const response = await fetchWithKey(
            `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${CHANNEL_ID}`
        );
        if (!response.ok) {
            throw new Error('Не вдалося отримати дані про підписників');
        }
        const data = await response.json();
        const subscriberCount = data.items[0].statistics.subscriberCount;
        localStorage.setItem(cacheKey, subscriberCount);
        localStorage.setItem(cacheTimeKey, currentTime.toString());
        subscribersDiv.innerHTML = `Нас уже майже<br><span class="subscribers-count">${subscriberCount}</span>`;
    } catch (error) {
        console.error('Помилка завантаження підписників:', error);
        subscribersDiv.innerHTML = 'Помилка завантаження підписників';
    }
}
fetchSubscribers();

// Фільтрація Shorts
async function filterNonShorts(videoIds) {
    if (!videoIds.length) return [];
    const response = await fetchWithKey(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(',')}`
    );
    if (!response.ok) {
        console.error('Помилка завантаження тривалості відео:', response.statusText);
        return videoIds;
    }
    const data = await response.json();
    const nonShorts = [];
    data.items.forEach((item, index) => {
        const duration = item.contentDetails.duration;
        const durationSeconds = parseDuration(duration);
        if (durationSeconds >= 60) {
            nonShorts.push(videoIds[index]);
        }
    });
    return nonShorts;
}

// Парсинг тривалості
function parseDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}

// Очищення опису
function cleanDescription(description) {
    return description
        .replace(/#[\wА-Яа-я]+/g, '') // Видаляємо хештеги
        .replace(/Вітаємо на каналі "Знання для всіх"/gi, '') // Видаляємо фразу
        .trim();
}

// Рендеринг відео
async function renderVideos(videos, container, isLatest = false) {
    container.innerHTML = ''; // Очищаємо контейнер перед рендерингом
    for (const video of videos) {
        const videoId = isLatest ? video.id.videoId : video.snippet.resourceId.videoId;
        const title = video.snippet.title;
        const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

        // Завантажуємо опис відео
        let description = '';
        try {
            const response = await fetchWithKey(
                `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`
            );
            if (response.ok) {
                const data = await response.json();
                description = cleanDescription(data.items[0].snippet.description);
            }
        } catch (error) {
            console.error('Помилка завантаження опису:', error);
        }

        const videoElement = document.createElement('div');
        videoElement.className = 'video-item';
        videoElement.innerHTML = `
            <div class="video-container">
                <img src="${thumbnail}" alt="${title}" class="thumbnail" data-video-id="${videoId}">
            </div>
            <p class="video-title" data-video-id="${videoId}">${title}${isLatest ? ' <span class="new">Нове</span>' : ''}</p>
            <div class="video-actions">
                <button class="comment-btn">Коментар</button>
                <div class="like-container">
                    <span class="heart" data-video-id="${videoId}">♡</span>
                    <span class="like-count" data-video-id="${videoId}">${localStorage.getItem(`likes_${videoId}`) || 0}</span>
                </div>
                <button class="more-btn" data-video-id="${videoId}">Більше</button>
            </div>
            <div class="comment-box" style="display: none;">
                <textarea placeholder="Ваш коментар..." rows="4"></textarea>
                <button class="submit-comment">Відправити</button>
                <div class="comment-list"></div>
            </div>
            <div class="description-box" style="display: none;" data-video-id="${videoId}">
                <p>${description || 'Опис недоступний'}</p>
            </div>
        `;
        container.appendChild(videoElement);

        // Завантажуємо збережені коментарі
        const commentList = videoElement.querySelector('.comment-list');
        const savedComments = JSON.parse(localStorage.getItem(`comments_${videoId}`) || '[]');
        savedComments.forEach((comment) => {
            const commentElement = document.createElement('p');
            commentElement.textContent = comment;
            commentList.appendChild(commentElement);
        });
    }

    // Обробка кліків на назву та обкладинку
    container.querySelectorAll('.video-title, .thumbnail').forEach((element) => {
        let isPlayerActive = false;
        element.addEventListener('click', (e) => {
            const videoId = e.target.getAttribute('data-video-id');
            const container = e.target.closest('.video-item').querySelector('.video-container');
            if (!isPlayerActive) {
                container.innerHTML = `
                    <iframe src="https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1" frameborder="0" allowfullscreen></iframe>
                `;
                isPlayerActive = true;
            }
        });
    });

    // Обробка коментарів
    container.querySelectorAll('.comment-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const commentBox = btn.parentElement.nextElementSibling;
            commentBox.style.display = commentBox.style.display === 'none' ? 'block' : 'none';
        });
    });

    container.querySelectorAll('.submit-comment').forEach((btn) => {
        btn.addEventListener('click', () => {
            const textarea = btn.previousElementSibling;
            const videoId = btn.closest('.video-item').querySelector('.heart').getAttribute('data-video-id');
            const commentList = btn.nextElementSibling;
            if (textarea.value.trim()) {
                const commentElement = document.createElement('p');
                commentElement.textContent = textarea.value.trim();
                commentList.appendChild(commentElement);
                // Зберігаємо коментар
                const savedComments = JSON.parse(localStorage.getItem(`comments_${videoId}`) || '[]');
                savedComments.push(textarea.value.trim());
                localStorage.setItem(`comments_${videoId}`, JSON.stringify(savedComments));
                textarea.value = '';
            }
        });
    });

    // Обробка лайків
    container.querySelectorAll('.heart').forEach((heart) => {
        const videoId = heart.getAttribute('data-video-id');
        if (localStorage.getItem(`liked_${videoId}`)) {
            heart.style.color = 'red';
            heart.innerHTML = '♥';
        }
        heart.addEventListener('click', () => {
            let likes = parseInt(localStorage.getItem(`likes_${videoId}`) || 0);
            if (!localStorage.getItem(`liked_${videoId}`)) {
                likes += 1;
                heart.style.color = 'red';
                heart.innerHTML = '♥';
                localStorage.setItem(`liked_${videoId}`, 'true');
                localStorage.setItem(`likes_${videoId}`, likes);
            } else {
                likes -= 1;
                heart.style.color = 'white';
                heart.innerHTML = '♡';
                localStorage.removeItem(`liked_${videoId}`);
                localStorage.setItem(`likes_${videoId}`, likes);
            }
            heart.nextElementSibling.textContent = likes;
        });
    });

    // Обробка кнопки "Більше/Менше"
    container.querySelectorAll('.more-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const videoId = btn.getAttribute('data-video-id');
            const descriptionBox = btn.parentElement.nextElementSibling.nextElementSibling;
            if (descriptionBox.style.display === 'none') {
                descriptionBox.style.display = 'block';
                btn.textContent = 'Менше';
            } else {
                descriptionBox.style.display = 'none';
                btn.textContent = 'Більше';
            }
        });
    });
}

// Завантаження останніх відео
async function fetchLatestVideos() {
    const latestVideosDiv = document.getElementById('latest-videos');
    const cacheKey = 'latestVideos';
    const cacheTimeKey = 'latestVideosTime';
    const cacheDuration = 24 * 60 * 60 * 1000;

    latestVideosDiv.classList.add('loading');

    const cachedVideos = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(cacheTimeKey);
    const now = new Date().getTime();

    if (cachedVideos && cachedTime && now - cachedTime < cacheDuration) {
        const videos = JSON.parse(cachedVideos);
        await renderVideos(videos, latestVideosDiv, true);
        latestVideosDiv.classList.remove('loading');
        return;
    }

    try {
        const response = await fetchWithKey(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=10&order=date&type=video`
        );
        if (!response.ok) {
            throw new Error('Не вдалося завантажити відео');
        }
        const data = await response.json();
        let videos = data.items.filter(
            (item) =>
                item.id &&
                item.id.videoId &&
                item.snippet &&
                item.snippet.title !== 'Private video'
        );

        const videoIds = videos.map((video) => video.id.videoId);
        const nonShortsIds = await filterNonShorts(videoIds);
        videos = videos.filter((video) => nonShortsIds.includes(video.id.videoId)).slice(0, 3);

        if (videos.length === 0) {
            latestVideosDiv.innerHTML = '<p>Немає доступних відео.</p>';
            latestVideosDiv.classList.remove('loading');
            return;
        }

        localStorage.setItem(cacheKey, JSON.stringify(videos));
        localStorage.setItem(cacheTimeKey, now.toString());

        await renderVideos(videos, latestVideosDiv, true);
    } catch (error) {
        console.error('Помилка завантаження найновіших відео:', error);
        latestVideosDiv.innerHTML = '<p>Помилка завантаження відео. Спробуйте пізніше.</p>';
    } finally {
        latestVideosDiv.classList.remove('loading');
    }
}
fetchLatestVideos();

// Мапа плейлистів
const playlistIds = {
    'Географія': 'PLOI77RmcxMp7iQywXcinPbgpl4kTXx_oV',
    'Історія': 'PLOI77RmcxMp57Hj3qFR8kv0D1rYs-MJNO',
    'Біблія': 'PLOI77RmcxMp6bsY12dqBZ9tdf-EMf6lpY',
    'Україна': 'PLOI77RmcxMp7umvhlyP8jIgvCk_9gKUFN',
    'Загальні знання': 'PLOI77RmcxMp40BcW7EImRhMEtLFieW9B7',
    'Логіка': 'PLOI77RmcxMp69eZQe-B51PXjk-hG123nE',
    'Що зайве': 'PLOI77RmcxMp6jhCedjZf7QYOscN3KuMIO',
    'Не програєш': 'PLOI77RmcxMp5FIXH2Z9OGFTEhrGQjBi_S',
};

// Завантаження випадкових відео
async function fetchRandomVideos() {
    const randomVideosDiv = document.getElementById('random-videos');
    const cacheKey = 'randomVideos';
    const cacheTimeKey = 'randomVideosTime';
    const cacheDuration = 24 * 60 * 60 * 1000;

    randomVideosDiv.classList.add('loading');

    const cachedVideos = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(cacheTimeKey);
    const now = new Date().getTime();

    if (cachedVideos && cachedTime && now - cachedTime < cacheDuration) {
        const videos = JSON.parse(cachedVideos);
        await renderVideos(videos, randomVideosDiv);
        randomVideosDiv.classList.remove('loading');
        return;
    }

    try {
        const width = window.innerWidth;
        let videoCount = 15; // Залишаємо 15 відео (до 5 рядів), оскільки не перевантажує
        if (width >= 600 && width < 900) {
            videoCount = 12;
        } else if (width < 600) {
            videoCount = 9;
        }

        const videosToShow = [];
        const categories = Object.keys(playlistIds);

        for (const category of categories) {
            const playlistId = playlistIds[category];
            const response = await fetchWithKey(
                `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`
            );
            if (!response.ok) {
                throw new Error('Не вдалося завантажити відео');
            }
            const data = await response.json();
            const items = data.items.filter(
                (item) =>
                    item.snippet &&
                    item.snippet.resourceId &&
                    item.snippet.resourceId.videoId &&
                    item.snippet.title !== 'Private video'
            );
            videosToShow.push(...items);
        }

        const videoIds = videosToShow.map((video) => video.snippet.resourceId.videoId);
        const nonShortsIds = await filterNonShorts(videoIds);
        const filteredVideos = videosToShow.filter((video) =>
            nonShortsIds.includes(video.snippet.resourceId.videoId)
        );

        const shuffledVideos = filteredVideos.sort(() => Math.random() - 0.5).slice(0, videoCount);
        if (shuffledVideos.length === 0) {
            randomVideosDiv.innerHTML = '<p>Немає доступних відео.</p>';
            randomVideosDiv.classList.remove('loading');
            return;
        }

        localStorage.setItem(cacheKey, JSON.stringify(shuffledVideos));
        localStorage.setItem(cacheTimeKey, now.toString());

        await renderVideos(shuffledVideos, randomVideosDiv);
    } catch (error) {
        console.error('Помилка завантаження випадкових відео:', error);
        randomVideosDiv.innerHTML = '<p>Помилка завантаження відео. Спробуйте пізніше.</p>';
    } finally {
        randomVideosDiv.classList.remove('loading');
    }
}
fetchRandomVideos();

// Показ/приховування списку категорій у футері
document.getElementById('categories-btn').addEventListener('click', () => {
    const list = document.getElementById('categories-list');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
});
