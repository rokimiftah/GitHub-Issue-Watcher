// src/components/home/Home.tsx

import { useEffect, useState } from "react";

import { useLocation } from "wouter";

import "./Home.css";

export const Home = () => {
	const [_location, navigate] = useLocation();
	const [isLoading, setIsLoading] = useState(false);

	const goToDashboard = () => {
		setIsLoading(true);
		setTimeout(() => {
			setIsLoading(false);
			if (document.startViewTransition) {
				document.startViewTransition(() => {
					navigate("/dashboard");
				});
			} else {
				navigate("/dashboard");
			}
		}, 3000);
	};

	useEffect(() => {
		setIsLoading(false);
	}, []);

	return (
		<div className="h-[100dvh] overflow-hidden bg-neutral-600">
			<div className="flex h-[100dvh] flex-col rounded-[16px] border-4 border-neutral-600 bg-[#111110] bg-[radial-gradient(#ffffff05_1px,transparent_1px)] bg-[length:16px_16px] px-4 text-center font-[Inter,system-ui,sans-serif] text-white sm:px-6 md:px-8">
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-4xl">
						<div className="mb-4 inline-block rounded-lg px-3 py-2 sm:px-4 sm:py-3 md:px-6 md:py-4">
							<h1 className="text-2xl leading-tight font-extrabold sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
								Watch GitHub Issues
								<br />
								Like Never Before
							</h1>
						</div>
						<p className="mx-auto mb-4 max-w-[90%] text-sm text-neutral-400 sm:text-base md:text-lg lg:text-xl">
							Struggling to find solutions in the latest library
							but Google falls short? GitHub Issue Watcher (GIW)
							is your answer! Simply input a repository URL and a
							keyword for your issue,{" "}
							<span className="underline underline-offset-[3px]">
								{" "}
								and our AI will analyze
							</span>{" "}
							open GitHub issues to deliver the most relevant ones
							directly to you—no endless scrolling through GitHub
							pagination required!
						</p>
						<button
							className="mt-4 mb-4 inline-flex h-10 w-28 cursor-pointer items-center justify-center rounded-xl bg-[#f5d90a] text-sm font-semibold text-[#111110] transition-colors duration-200 hover:bg-[#f5d90ada] disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-32 sm:text-base md:text-lg"
							onClick={goToDashboard}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ")
									goToDashboard();
							}}
							disabled={isLoading}
						>
							<div className="flex h-4 w-4 items-center justify-center sm:h-5 sm:w-5">
								{isLoading ? (
									<svg
										className="h-4 w-4 animate-spin text-[#111110] sm:h-5 sm:w-5"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										></circle>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										></path>
									</svg>
								) : (
									<span className="text-center text-sm leading-4 font-semibold sm:text-base sm:leading-5">
										Dashboard
									</span>
								)}
							</div>
						</button>
						<div
							id="convex"
							className="mx-auto mt-5 mb-5 w-full max-w-2xl rounded-xl border border-neutral-600 bg-[#111110]"
						>
							<div className="flex items-center border-b border-neutral-700 px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-3">
								<div className="mr-1 h-1.5 w-1.5 rounded-full bg-red-500 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5"></div>
								<div className="mr-1 h-1.5 w-1.5 rounded-full bg-yellow-500 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5"></div>
								<div className="mr-1 h-1.5 w-1.5 rounded-full bg-green-500 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5"></div>
								<div className="ml-auto overflow-x-hidden font-mono text-[8px] text-neutral-400 hover:text-neutral-300 sm:text-[10px] md:text-xs">
									<div
										className="cursor-pointer truncate font-medium transition-all duration-200 hover:[text-shadow:0_0_6px_rgba(255,255,255,0.7),0_0_10px_rgba(0,255,255,0.5)]"
										onClick={() =>
											window.open(
												"https://github.com/get-convex/convex-backend",
												"_blank",
												"noopener,noreferrer",
											)
										}
									>
										github.com/get-convex/convex-backend
									</div>
								</div>
							</div>
							<div className="max-h-[40dvh] overflow-y-auto px-2 py-3 sm:px-3 sm:py-4 md:p-5">
								<div
									className="mb-2 flex cursor-pointer items-start gap-1.5 rounded-xl border border-neutral-600 p-1.5 transition-all duration-200 hover:border-green-700 hover:bg-neutral-800 sm:gap-2 sm:p-2 md:gap-3 md:p-3"
									onClick={() =>
										window.open(
											"https://github.com/get-convex/convex-backend/issues/54",
											"_blank",
											"noopener,noreferrer",
										)
									}
								>
									<div className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5"></div>
									<div className="flex-1 overflow-hidden">
										<h4 className="mb-0.5 truncate text-[10px] font-semibold sm:text-xs md:text-sm">
											Convex Flutter support
										</h4>
										<p className="mb-1 line-clamp-2 text-[8px] text-neutral-400 sm:text-[10px] md:text-xs">
											I'd love to switch my Flutter app
											from Supabase to Convex, but...
										</p>
										<div className="flex items-center gap-1 text-[8px] sm:gap-1.5 sm:text-[10px] md:gap-2 md:text-xs">
											<span className="rounded-md bg-purple-100 px-1 py-0.5 font-medium text-purple-800 sm:px-1.5">
												enhancement
											</span>
											<span className="text-neutral-500">
												#54 • 3months ago
											</span>
										</div>
									</div>
								</div>
								<div
									className="mb-2 flex cursor-pointer items-start gap-1.5 rounded-xl border border-neutral-600 p-1.5 transition-all duration-200 hover:border-red-700 hover:bg-neutral-800 sm:gap-2 sm:p-2 md:gap-3 md:p-3"
									onClick={() =>
										window.open(
											"https://github.com/get-convex/convex-backend/issues/140",
											"_blank",
											"noopener,noreferrer",
										)
									}
								>
									<div className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5"></div>
									<div className="flex-1 overflow-hidden">
										<h4 className="mb-0.5 truncate text-[10px] font-semibold sm:text-xs md:text-sm">
											[Bug] Convex CLI fails on windows
										</h4>
										<p className="mb-1 line-clamp-2 text-[8px] text-neutral-400 sm:text-[10px] md:text-xs">
											"Path component can only contain
											alphanumeric characters,
											underscores" ...
										</p>
										<div className="flex items-center gap-1 text-[8px] sm:gap-1.5 sm:text-[10px] md:gap-2 md:text-xs">
											<span className="rounded-md bg-red-100 px-1 py-0.5 font-medium text-red-800 sm:px-1.5">
												bug
											</span>
											<span className="text-neutral-500">
												#140 • 3weeks ago
											</span>
										</div>
									</div>
								</div>
								<div
									className="flex cursor-pointer items-start gap-1.5 rounded-xl border border-neutral-600 p-1.5 transition-all duration-200 hover:border-blue-700 hover:bg-neutral-800 sm:gap-2 sm:p-2 md:gap-3 md:p-3"
									onClick={() =>
										window.open(
											"https://github.com/get-convex/convex-backend/issues/149",
											"_blank",
											"noopener,noreferrer",
										)
									}
								>
									<div className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5"></div>
									<div className="flex-1 overflow-hidden">
										<h4 className="mb-0.5 truncate text-[10px] font-semibold sm:text-xs md:text-sm">
											Include cause and extra
											properties...
										</h4>
										<p className="mb-1 line-clamp-2 text-[8px] text-neutral-400 sm:text-[10px] md:text-xs">
											For debugging purposes, it is normal
											to chain errors together with the...
										</p>
										<div className="flex items-center gap-1 text-[8px] sm:gap-1.5 sm:text-[10px] md:gap-2 md:text-xs">
											<span className="rounded-md bg-blue-100 px-1 py-0.5 font-medium text-blue-900 sm:px-1.5">
												feature
											</span>
											<span className="text-neutral-500">
												#149 • 2weeks ago
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
