// src/index.tsx

import React from "react";
import ReactDOM from "react-dom/client";

import { Route, Router, Switch } from "wouter";

import { Dashboard } from "@components/dashboard";
import { Home } from "@components/home";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<Router base="/">
			<Switch>
				<Route path="/" component={Home} />
				<Route path="/dashboard" component={Dashboard} />
				<Route>
					<div>404</div>
				</Route>
			</Switch>
		</Router>
	</React.StrictMode>,
);
