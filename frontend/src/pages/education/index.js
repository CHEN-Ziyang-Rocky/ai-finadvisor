import React, { useEffect, useState } from "react";
import "./index.css"; 
import { fetchYouTubeChannels, fetchYouTubeVideos } from '../../api'; 

const Education = () => {
    const [channels, setChannels] = useState([]);
    const [videos, setVideos] = useState([]);

    useEffect(() => {
        const colors = ["#1e3c72", "#2a5298", "#0d47a1", "#1b5e20", "#3e2723", "#263238"];
        const bookCovers = document.querySelectorAll(".book-cover");
        bookCovers.forEach(cover => {
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            cover.style.background = `linear-gradient(135deg, ${randomColor} 0%, ${randomColor} 100%)`;
        });

        // Fetch YouTube channel details and videos from the backend
        const fetchYouTubeData = async () => {
            try {
                const channelsData = await fetchYouTubeChannels();
                setChannels(channelsData);

                const videosData = await fetchYouTubeVideos();
                const flattenedVideos = videosData.flatMap(channel => 
                    channel.videos.map(video => ({ ...video, channelId: channel.channelId }))
                );
                setVideos(flattenedVideos);
            } catch (error) {
                console.error('Error fetching YouTube data:', error);
            }
        };

        fetchYouTubeData();
    }, []);

    return (
        <div className="education-container">
            <h1>Educational Resources</h1>
            <section className="youtube-section">
                <h2>Recommended YouTube Channels</h2>
                {Array.isArray(channels) ? (
                    channels.map(channel => (
                        <div key={channel.id} className="youtube-channel">
                            <img src={channel.snippet.thumbnails.default.url} alt={`${channel.snippet.title} icon`} />
                            <div className="channel-details">
                                <h3>{channel.snippet.title}</h3>
                                <p>{channel.statistics.subscriberCount} subscribers</p>
                            </div>
                            <div className="video-list">
                                {videos
                                    .filter(video => video.snippet && video.channelId === channel.id)
                                    .map(video => (
                                        video.id && video.id.videoId && video.snippet && video.snippet.thumbnails && video.snippet.thumbnails.default && (
                                            <div key={video.id.videoId} className="video">
                                                <a href={`https://www.youtube.com/watch?v=${video.id.videoId}`} target="_blank" rel="noopener noreferrer">
                                                    <img src={video.snippet.thumbnails.default.url} alt={video.snippet.title} />
                                                    <p>{video.snippet.title}</p>
                                                </a>
                                            </div>
                                        )
                                    ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <p>No channels available</p>
                )}
            </section>
            <section className="book-section">
                <h2>Book Resources</h2>
                <div className="resource-container">
                    <div className="resource">
                        <a href="https://openstax.org/details/books/principles-financial-accounting" target="_blank" rel="noopener noreferrer">
                            <div className="book-cover">
                                <p>Principles of Accounting Volume 1 Financial Accounting</p>
                            </div>
                        </a>
                    </div>
                    <div className="resource">
                        <a href="https://openstax.org/details/books/principles-managerial-accounting" target="_blank" rel="noopener noreferrer">
                            <div className="book-cover">
                                <p>Principles of Accounting Volume 2 Managerial Accounting</p>
                            </div>
                        </a>
                    </div>
                    <div className="resource">
                        <a href="https://openstax.org/details/books/principles-finance" target="_blank" rel="noopener noreferrer">
                            <div className="book-cover">
                                <p>Principles of Finance</p>
                            </div>
                        </a>
                    </div>
                    <div className="resource">
                        <a href="https://openstax.org/details/books/principles-economics-3e" target="_blank" rel="noopener noreferrer">
                            <div className="book-cover">
                                <p>Principles of Economics 3e</p>
                            </div>
                        </a>
                    </div>
                    <div className="resource">
                        <a href="https://openstax.org/details/books/principles-macroeconomics-3e" target="_blank" rel="noopener noreferrer">
                            <div className="book-cover">
                                <p>Principles of Macroeconomics 3e</p>
                            </div>
                        </a>
                    </div>
                    <div className="resource">
                        <a href="https://openstax.org/details/books/principles-microeconomics-3e" target="_blank" rel="noopener noreferrer">
                            <div className="book-cover">
                                <p>Principles of Microeconomics 3e</p>
                            </div>
                        </a>
                    </div>
                </div>
                <p className="additional-text">
                    These books are provided by <a href="https://openstax.org/" target="_blank" rel="noopener noreferrer">OpenStax</a>. For more educational resources, visit the <a href="https://openstax.org/subjects/business" target="_blank" rel="noopener noreferrer">OpenStax Business page</a>.
                </p>
            </section>
            <section className="external-resources">
                <h2>IFEC Resources</h2>
                <div className="iframe-container">
                    <iframe 
                        src="https://www.ifec.org.hk/web/en/moneyessentials/index.page" 
                        title="IFEC Money Essentials" 
                        width="100%" 
                        height="600px" 
                        style={{ border: "none" }}
                    ></iframe>
                </div>
            </section>
        </div>
    )
}

export default Education;