// src/components/dashboard/ui/Sidebar.tsx
import { useState } from "react";

import {
	AppShell,
	Avatar,
	Box,
	Burger,
	Group,
	Menu,
	NavLink,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
	IconDashboard,
	IconLogout,
	IconSettings,
	IconShoppingCart,
	IconUserCircle,
	IconUsers,
} from "@tabler/icons-react";

const navItems = [
	{ icon: IconDashboard, label: "Dashboard", href: "/dashboard" },
	{ icon: IconShoppingCart, label: "Orders", href: "/orders" },
	{ icon: IconUsers, label: "Customers", href: "/customers" },
	{ icon: IconSettings, label: "Settings", href: "/settings" },
];

export function Sidebar({ children }: { children: React.ReactNode }) {
	const [opened, { toggle }] = useDisclosure();
	const [active, setActive] = useState("Dashboard");

	return (
		<AppShell
			header={{ height: 60 }}
			navbar={{
				width: 240,
				breakpoint: "sm",
				collapsed: { mobile: !opened },
			}}
			padding="md"
		>
			<AppShell.Header
				bg="dark.8"
				style={{ border: "none", boxShadow: "0 1px 0 #25262b" }}
			>
				<Group h="100%" px="lg" justify="space-between">
					<Group>
						<Burger
							opened={opened}
							onClick={toggle}
							hiddenFrom="sm"
							size="sm"
							color="white"
						/>
						<Text size="lg" fw={600} c="white">
							Dashboard
						</Text>
					</Group>
					<Menu width={200} shadow="md">
						<Menu.Target>
							<UnstyledButton>
								<Avatar radius="xl" size="sm" color="blue">
									JD
								</Avatar>
							</UnstyledButton>
						</Menu.Target>
						<Menu.Dropdown>
							<Menu.Item
								leftSection={<IconUserCircle size={14} />}
							>
								Profile
							</Menu.Item>
							<Menu.Item leftSection={<IconLogout size={14} />}>
								Logout
							</Menu.Item>
						</Menu.Dropdown>
					</Menu>
				</Group>
			</AppShell.Header>

			<AppShell.Navbar
				bg="dark.8"
				style={{ border: "none", borderRight: "1px solid #25262b" }}
			>
				<Box p="md">
					<Stack gap="xs">
						{navItems.map((item) => (
							<NavLink
								key={item.label}
								label={item.label}
								leftSection={<item.icon size={16} />}
								active={active === item.label}
								variant="subtle"
								color="blue"
								c="gray.2"
								style={{
									borderRadius: "8px",
									fontWeight: 500,
									fontSize: "14px",
								}}
								onClick={() => setActive(item.label)}
							/>
						))}
					</Stack>
				</Box>
			</AppShell.Navbar>

			<AppShell.Main bg="dark.9">{children}</AppShell.Main>
		</AppShell>
	);
}
